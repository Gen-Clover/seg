import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { collections } from "../db";
import { env } from "../env";
import { getSettings } from "../services/settings";
import { isDemoUser } from "./credentials";
import { SESSION_COOKIE, signSession, verifySession, type Session } from "./session";

/** How long a checked session is trusted before re-reading it (revocations apply within this). */
const CHECK_MS = 10_000;
/** How often "last seen" is written for a session. */
const SEEN_MS = 60_000;
const cache = globalThis as unknown as { __segSessionCache?: Map<string, { until: number; session: Session | null }> };

/**
 * The signed-in person for this request, or null.
 * The cookie proves who it is; the database decides whether the session is still valid:
 * the session must exist and not be revoked, the user must be active, "sign out everywhere"
 * must not have happened since, and demo accounts must be allowed. Role and access limits are
 * read from the user record, so admin changes apply at once.
 */
export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  const token = verifySession(store.get(SESSION_COOKIE)?.value, env().AUTH_SECRET);
  const claims = await token;
  if (!claims?.jti) return null;

  cache.__segSessionCache ??= new Map();
  const hit = cache.__segSessionCache.get(claims.jti);
  if (hit && hit.until > Date.now()) return hit.session;

  const [sessionDoc, user, settings] = await Promise.all([
    (await collections.sessions()).findOne({ _id: claims.jti }),
    (await collections.users()).findOne({ _id: claims.email }),
    getSettings(),
  ]);
  let session: Session | null = null;
  const issuedAt = (claims.iat ?? 0) * 1000;
  if (
    sessionDoc &&
    !sessionDoc.revokedAt &&
    user?.active &&
    !(user.sessionsValidAfter && Date.parse(user.sessionsValidAfter) > issuedAt) &&
    !(isDemoUser(user) && !settings.demo.allowDemoLogins)
  ) {
    session = {
      email: user.email,
      name: user.name,
      role: user.role,
      jti: claims.jti,
      iat: claims.iat,
      scope: user.scope && (user.scope.divisions.length || user.scope.imprints.length) ? user.scope : undefined,
    };
    if (Date.now() - Date.parse(sessionDoc.lastSeenAt) > SEEN_MS) {
      void (await collections.sessions()).updateOne({ _id: claims.jti }, { $set: { lastSeenAt: new Date().toISOString() } }).catch(() => undefined);
    }
  }
  cache.__segSessionCache.set(claims.jti, { until: Date.now() + CHECK_MS, session });
  if (cache.__segSessionCache.size > 5000) cache.__segSessionCache.clear();
  return session;
}

/** Forget cached checks (after an admin revokes sessions on this server). */
export function clearSessionCache() {
  cache.__segSessionCache?.clear();
}

export async function startSession(user: { email: string; name: string; role: Session["role"] }) {
  const e = env();
  const hours = (await getSettings()).sessions.hours;
  const jti = randomUUID();
  const h = await headers();
  const now = new Date();
  await (await collections.sessions()).insertOne({
    _id: jti,
    email: user.email,
    name: user.name,
    createdAt: now.toISOString(),
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + hours * 3600_000),
    userAgent: h.get("user-agent"),
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    revokedAt: null,
    revokedBy: null,
  });
  const token = await signSession({ ...user, jti }, e.AUTH_SECRET, hours);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.round(hours * 3600),
  });
}

export async function endSession() {
  const store = await cookies();
  const claims = await verifySession(store.get(SESSION_COOKIE)?.value, env().AUTH_SECRET);
  if (claims?.jti) {
    await (await collections.sessions()).updateOne({ _id: claims.jti }, { $set: { revokedAt: new Date().toISOString(), revokedBy: claims.email } });
    cache.__segSessionCache?.delete(claims.jti);
  }
  store.delete(SESSION_COOKIE);
}
