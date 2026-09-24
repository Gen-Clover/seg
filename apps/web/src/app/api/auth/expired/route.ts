import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/session";

/**
 * Where pages send a browser whose session is no longer valid (revoked, expired, user
 * deactivated, or an older cookie). Pages can't delete cookies, so this route does, then
 * goes to /login — otherwise the page guard would keep bouncing between /login and the app.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next");
  const login = new URL("/login", url);
  if (next && next.startsWith("/") && !next.startsWith("//")) login.searchParams.set("next", next);
  const res = NextResponse.redirect(login);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
