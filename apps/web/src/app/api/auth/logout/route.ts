import { NextResponse } from "next/server";
import { endSession } from "@/server/auth/current";

export async function POST() {
  await endSession();
  return NextResponse.json({ ok: true });
}
