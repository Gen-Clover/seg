import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { errorResponse, HttpError } from "@/server/http";
import { refreshTrends } from "@/server/services/trends";

export const maxDuration = 120;

/** Recomputes the weekly dashboard series (also part of the nightly ingest). Bearer CRON_SECRET. */
export async function GET(request: Request) {
  try {
    const secret = env().CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
    const started = Date.now();
    return NextResponse.json({ ...(await refreshTrends()), ms: Date.now() - started });
  } catch (err) {
    return errorResponse(err);
  }
}
