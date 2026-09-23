import { route } from "@/server/http";
import { searchTitles } from "@/server/services/titles";

export const GET = route(async ({ request }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 20);
  return { results: await searchTitles(q, Number.isFinite(limit) ? Math.min(limit, 50) : 20) };
});
