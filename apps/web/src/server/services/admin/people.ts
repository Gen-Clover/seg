import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { UserDoc } from "@seg/data";
import { hashPassword } from "@seg/data/password";
import { clearSessionCache } from "../../auth/current";
import { isDemoUser } from "../../auth/credentials";
import type { Session } from "../../auth/session";
import { collections } from "../../db";
import { env } from "../../env";
import { HttpError } from "../../http";
import { audit, getSettings, updateSettings } from "../settings";
import { scheduleWriteback } from "../writeback";

const ONLINE_MS = 15 * 60_000;
const scopeSchema = z.object({ divisions: z.array(z.string()).default([]), imprints: z.array(z.string()).default([]) });

export const newUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(80),
  role: z.enum(["admin", "editor", "viewer"]),
  scope: scopeSchema.prefault({}),
});
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
  active: z.boolean().optional(),
  scope: scopeSchema.optional(),
  resetPassword: z.boolean().optional(),
  signOutEverywhere: z.boolean().optional(),
});

export interface AdminUserView {
  email: string;
  name: string;
  role: UserDoc["role"];
  active: boolean;
  demo: boolean;
  scope: { divisions: string[]; imprints: string[] };
  createdAt: string;
  createdBy: string | null;
  lastSignInAt: string | null;
  sessions: number;
  online: boolean;
}

export async function listUsers(): Promise<AdminUserView[]> {
  const [users, sessions] = await Promise.all([
    (await collections.users()).find({}, { projection: { passwordHash: 0 } }).sort({ name: 1 }).toArray(),
    (await collections.sessions()).find({ revokedAt: null, expiresAt: { $gt: new Date() } }, { projection: { email: 1, lastSeenAt: 1 } }).toArray(),
  ]);
  const now = Date.now();
  return users.map((u) => {
    const mine = sessions.filter((s) => s.email === u.email && !(u.sessionsValidAfter && u.sessionsValidAfter > s.lastSeenAt));
    return {
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      demo: isDemoUser(u),
      scope: u.scope ?? { divisions: [], imprints: [] },
      createdAt: u.createdAt,
      createdBy: u.createdBy ?? null,
      lastSignInAt: u.lastSignInAt ?? null,
      sessions: mine.length,
      online: mine.some((s) => now - Date.parse(s.lastSeenAt) < ONLINE_MS),
    };
  });
}

const tempPassword = () => randomBytes(9).toString("base64url");

/** Adds a person. With demo sign-in a one-time password is returned (shown once to the admin). */
export async function createUser(input: z.infer<typeof newUserSchema>, admin: Session): Promise<{ user: AdminUserView; password: string | null }> {
  const users = await collections.users();
  if (await users.countDocuments({ _id: input.email }, { limit: 1 })) throw new HttpError(409, "Someone with that e-mail already exists.");
  const credentials = env().AUTH_PROVIDER === "credentials";
  const password = credentials ? tempPassword() : null;
  const now = new Date().toISOString();
  await users.insertOne({
    _id: input.email,
    email: input.email,
    name: input.name,
    role: input.role,
    passwordHash: password ? await hashPassword(password) : null,
    active: true,
    createdAt: now,
    createdBy: admin.email,
    demo: false,
    scope: input.scope,
    lastSignInAt: null,
    updatedAt: now,
    syncedAt: null,
  });
  await audit(admin, "users", "create", `Added ${input.name} <${input.email}> as ${input.role}${scopeText(input.scope)}`);
  scheduleWriteback();
  const user = (await listUsers()).find((u) => u.email === input.email)!;
  return { user, password };
}

const scopeText = (s: { divisions: string[]; imprints: string[] }) =>
  s.divisions.length || s.imprints.length ? ` (limited to ${[...s.divisions, ...s.imprints].join(", ")})` : "";

async function assertKeepsAnAdmin(email: string, change: { role?: string; active?: boolean }) {
  const users = await collections.users();
  const target = await users.findOne({ _id: email });
  if (!target || target.role !== "admin" || !target.active) return;
  const losesAdmin = (change.role && change.role !== "admin") || change.active === false;
  if (!losesAdmin) return;
  const others = await users.countDocuments({ _id: { $ne: email }, role: "admin", active: true });
  if (!others) throw new HttpError(400, "SEG needs at least one active admin. Make someone else an admin first.");
}

export async function updateUser(email: string, input: z.infer<typeof updateUserSchema>, admin: Session): Promise<{ password: string | null }> {
  const users = await collections.users();
  const user = await users.findOne({ _id: email });
  if (!user) throw new HttpError(404, "That person was not found.");
  if (email === admin.email && (input.active === false || (input.role && input.role !== "admin"))) {
    throw new HttpError(400, "You can't deactivate yourself or remove your own admin role.");
  }
  await assertKeepsAnAdmin(email, input);

  const now = new Date().toISOString();
  const set: Partial<UserDoc> = { updatedAt: now, syncedAt: null };
  const changes: string[] = [];
  if (input.name && input.name !== user.name) {
    set.name = input.name;
    changes.push(`name → ${input.name}`);
  }
  if (input.role && input.role !== user.role) {
    set.role = input.role;
    changes.push(`role ${user.role} → ${input.role}`);
  }
  if (input.active !== undefined && input.active !== user.active) {
    set.active = input.active;
    changes.push(input.active ? "reactivated" : "deactivated");
    if (!input.active) set.sessionsValidAfter = now; // signed out everywhere at once
  }
  if (input.scope) {
    set.scope = input.scope;
    changes.push(`access${scopeText(input.scope) || " → all divisions and imprints"}`);
  }
  let password: string | null = null;
  if (input.resetPassword) {
    if (env().AUTH_PROVIDER !== "credentials") throw new HttpError(400, "Passwords are managed by Microsoft sign-in in this environment.");
    password = tempPassword();
    set.passwordHash = await hashPassword(password);
    set.sessionsValidAfter = now;
    changes.push("password reset (signed out everywhere)");
  }
  if (input.signOutEverywhere) {
    set.sessionsValidAfter = now;
    changes.push("signed out everywhere");
  }
  await users.updateOne({ _id: email }, { $set: set });
  if (set.sessionsValidAfter) await (await collections.sessions()).updateMany({ email, revokedAt: null }, { $set: { revokedAt: now, revokedBy: admin.email } });
  clearSessionCache();
  if (changes.length) await audit(admin, "users", "update", `${user.name} <${email}>: ${changes.join("; ")}`);
  scheduleWriteback();
  return { password };
}

export async function listSessions() {
  const [sessions, users] = await Promise.all([
    (await collections.sessions()).find({ revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).limit(500).toArray(),
    (await collections.users()).find({}, { projection: { role: 1, sessionsValidAfter: 1, active: 1 } }).toArray(),
  ]);
  const byEmail = new Map(users.map((u) => [u._id, u]));
  const now = Date.now();
  return {
    hours: (await getSettings()).sessions.hours,
    sessions: sessions
      .filter((s) => {
        const u = byEmail.get(s.email);
        return u?.active && !(u.sessionsValidAfter && u.sessionsValidAfter > s.createdAt);
      })
      .map((s) => ({
        id: s._id,
        email: s.email,
        name: s.name,
        role: byEmail.get(s.email)?.role ?? "viewer",
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt.toISOString(),
        online: now - Date.parse(s.lastSeenAt) < ONLINE_MS,
        device: describeAgent(s.userAgent),
        ip: s.ip,
      })),
  };
}

function describeAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

export async function revokeSession(id: string, admin: Session) {
  const sessions = await collections.sessions();
  const s = await sessions.findOne({ _id: id });
  if (!s || s.revokedAt) throw new HttpError(404, "That session has already ended.");
  if (id === admin.jti) throw new HttpError(400, "That's your own session — use Sign out instead.");
  await sessions.updateOne({ _id: id }, { $set: { revokedAt: new Date().toISOString(), revokedBy: admin.email } });
  clearSessionCache();
  await audit(admin, "sessions", "revoke", `Signed out ${s.name} <${s.email}> on one device`);
}

/** Demo accounts on/off, with a guard so an admin cannot lock everyone out. */
export async function setDemo(input: { allowDemoLogins: boolean; showOnLogin: boolean }, admin: Session) {
  if (!input.allowDemoLogins) {
    const users = await collections.users();
    const realAdmins = (await users.find({ role: "admin", active: true }).toArray()).filter((u) => !isDemoUser(u));
    if (!realAdmins.length) throw new HttpError(400, "Add a non-demo admin first — otherwise nobody could sign in to the admin console.");
  }
  await updateSettings("demo", input, admin);
  clearSessionCache();
}
