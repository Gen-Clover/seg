import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@seg/data";

/**
 * Session = signed, httpOnly cookie. The same cookie format is used whichever sign-in
 * provider is active (demo credentials now, Microsoft Entra ID in production).
 * Kept free of Node-only APIs so the proxy can verify it cheaply.
 */
export const SESSION_COOKIE = "seg_session";

export interface Session {
  email: string;
  name: string;
  role: Role;
  /** Session id (one per sign-in; revoking it signs that browser out). */
  jti?: string;
  /** When the session was issued (seconds since epoch). */
  iat?: number;
  /** Editing limited to these divisions / imprints (from the user record). */
  scope?: { divisions: string[]; imprints: string[] };
}

const key = (secret: string) => new TextEncoder().encode(secret);

export async function signSession(session: Session, secret: string, hours: number): Promise<string> {
  return new SignJWT({ name: session.name, role: session.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.email)
    .setJti(session.jti ?? crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(key(secret));
}

export async function verifySession(token: string | undefined, secret: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    const role = payload.role as Role;
    if (!payload.sub || !["admin", "editor", "viewer"].includes(role)) return null;
    return { email: payload.sub, name: String(payload.name ?? payload.sub), role, jti: payload.jti, iat: payload.iat };
  } catch {
    return null;
  }
}

export const canEdit = (role: Role) => role === "admin" || role === "editor";
