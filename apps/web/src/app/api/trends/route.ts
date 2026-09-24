import { route } from "@/server/http";
import { pickVisible } from "@/server/auth/scope";
import { getTrends } from "@/server/services/trends";

/** Weekly totals per title for the season dashboard (the browser sums the titles in view). */
export const GET = route(async ({ session }) => {
  const all = await getTrends();
  return { ...all, series: await pickVisible(session, all.series) };
}, { feature: "dashboard" });
