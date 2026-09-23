import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { errorResponse, HttpError } from "@/server/http";
import { runIngest } from "@/server/services/ingest";
import { recordJob } from "@/server/services/jobs";

export const maxDuration = 300;

/**
 * Nightly: rebuild MongoDB reference data from BigQuery.
 * Called by Vercel Cron (Authorization: Bearer CRON_SECRET) or the client's scheduler.
 * `?sql=0` skips re-running the ingestion SQL (just reload the existing BigQuery tables).
 */
export async function GET(request: Request) {
  try {
    const secret = env().CRON_SECRET;
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Unauthorized");
    const rebuildSql = new URL(request.url).searchParams.get("sql") !== "0";
    return NextResponse.json(await recordJob("ingest", "schedule", () => runIngest({ rebuildSql })));
  } catch (err) {
    return errorResponse(err);
  }
}
