import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { verifyPassword } from "@seg/data/password";
import { collections } from "../db";
import { getSettings } from "../services/settings";
import type { Session } from "./session";

/** Seeded demo accounts (flagged, or the demo e-mail domain for accounts created before the flag). */
export const isDemoUser = (u: { demo?: boolean; email: string }) => u.demo ?? u.email.endsWith("@seg-demo.com");

const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

/**
 * DEMO sign-in: email + password checked against the users collection.
 * Production replaces this with Microsoft Entra ID (AUTH_PROVIDER=entra); the user record
 * and role checks stay the same, only the proof of identity changes.
 * Returns the user, or the reason sign-in failed (recorded in the sign-in log, never shown).
 */
export async function signInWithPassword(email: string, password: string): Promise<{ user: Session } | { reason: string }> {
  const users = await collections.users();
  const user = await users.findOne({ _id: email.trim().toLowerCase() });
  if (!user || !user.active) {
    // Same work either way, so response time does not reveal whether the email exists.
    await verifyPassword(password, DUMMY_HASH);
    return { reason: user ? "account deactivated" : "unknown email" };
  }
  if (!(await verifyPassword(password, user.passwordHash))) return { reason: "wrong password" };
  if (isDemoUser(user) && !(await getSettings()).demo.allowDemoLogins) return { reason: "demo accounts are turned off" };
  return { user: { email: user.email, name: user.name, role: user.role } };
}

/** Records a sign-in attempt (kept for the admin-set retention period). */
export async function logSignIn(email: string, ok: boolean, reason: string | null) {
  const h = await headers();
  const days = (await getSettings()).retention.signInLogDays;
  const now = new Date();
  await (await collections.signIns()).insertOne({
    _id: randomUUID(),
    email: email.trim().toLowerCase(),
    at: now.toISOString(),
    ok,
    reason,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    expiresAt: new Date(now.getTime() + days * 86_400_000),
  });
  if (ok) await (await collections.users()).updateOne({ _id: email.trim().toLowerCase() }, { $set: { lastSignInAt: now.toISOString() } });
}
