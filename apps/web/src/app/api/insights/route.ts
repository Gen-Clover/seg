import { route } from "@/server/http";
import { pickVisible } from "@/server/auth/scope";
import { channelInsights } from "@/server/services/insights";

/** Channel breakdown per title for the dashboard (the browser sums the titles in view). */
export const GET = route(async ({ session }) => {
  const all = await channelInsights();
  return { ...all, rows: await pickVisible(session, all.rows) };
}, { feature: "dashboard" });
