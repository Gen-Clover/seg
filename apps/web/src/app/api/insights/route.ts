import { route } from "@/server/http";
import { channelInsights } from "@/server/services/insights";

/** Channel breakdown per title for the dashboard (the browser sums the titles in view). */
export const GET = route(async () => channelInsights(), { feature: "dashboard" });
