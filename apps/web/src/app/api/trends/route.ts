import { route } from "@/server/http";
import { getTrends } from "@/server/services/trends";

/** Weekly totals per title for the season dashboard (the browser sums the titles in view). */
export const GET = route(async () => getTrends(), { feature: "dashboard" });
