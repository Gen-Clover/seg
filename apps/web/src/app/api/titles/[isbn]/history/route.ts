import { collections } from "@/server/db";
import { route } from "@/server/http";

/** Change history for a title (optionally one estimate row). */
export const GET = route<{ isbn: string }>(async ({ request, params }) => {
  const estimateId = new URL(request.url).searchParams.get("estimateId");
  const events = await collections.events();
  const items = await events
    .find(
      { isbn: params.isbn, ...(estimateId ? { estimateId } : {}) },
      { projection: { syncedAt: 0 } },
    )
    .sort({ changedAt: -1 })
    .limit(200)
    .toArray();
  return { items };
});
