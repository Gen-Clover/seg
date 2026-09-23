import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithPassword } from "@/server/auth/credentials";
import { startSession } from "@/server/auth/current";
import { env } from "@/server/env";
import { errorResponse, HttpError, readJson } from "@/server/http";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(request: Request) {
  try {
    if (env().AUTH_PROVIDER !== "credentials") throw new HttpError(404, "Password sign-in is disabled.");
    const { email, password } = await readJson(request, schema);
    const session = await signInWithPassword(email, password);
    if (!session) throw new HttpError(401, "That email and password don't match.");
    await startSession(session);
    return NextResponse.json({ user: session });
  } catch (err) {
    return errorResponse(err);
  }
}
