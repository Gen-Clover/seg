import { verifyPassword } from "@seg/data/password";
import { collections } from "../db";
import type { Session } from "./session";

/**
 * DEMO sign-in: email + password checked against the users collection.
 * Production replaces this with Microsoft Entra ID (AUTH_PROVIDER=entra); the user record
 * and role checks stay the same, only the proof of identity changes.
 */
export async function signInWithPassword(email: string, password: string): Promise<Session | null> {
  const users = await collections.users();
  const user = await users.findOne({ _id: email.trim().toLowerCase() });
  if (!user || !user.active) {
    // Same work either way, so response time does not reveal whether the email exists.
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;
  return { email: user.email, name: user.name, role: user.role };
}
