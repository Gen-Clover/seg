import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { getSummary } from "@/server/services/titles";

/** Whole in-scope catalog with totals; filtering and sorting happen instantly in the browser. */
export const GET = route(async ({ session }) => {
  const titles = await getSummary(session);
  return NextResponse.json({ titles, generatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
});
