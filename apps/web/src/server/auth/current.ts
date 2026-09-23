import { cookies } from "next/headers";
import { env } from "../env";
import { SESSION_COOKIE, signSession, verifySession, type Session } from "./session";

export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value, env().AUTH_SECRET);
}

export async function startSession(session: Session) {
  const e = env();
  const token = await signSession(session, e.AUTH_SECRET, e.SESSION_HOURS);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: e.SESSION_HOURS * 3600,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
