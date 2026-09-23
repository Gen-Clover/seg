import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { errorResponse, HttpError } from "@/server/http";
import { flushWriteback } from "@/server/services/writeback";

/** Safety-net flush of pending edits to BigQuery. Called by Vercel Cron / the client's scheduler. */
export async function GET(request: Request) {
  try {
    const secret = env().CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
    return NextResponse.json(await flushWriteback());
  } catch (err) {
    return errorResponse(err);
  }
}
