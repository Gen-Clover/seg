import type { Filter } from "mongodb";
import type { EstimateEventDoc } from "@seg/data";
import { collections } from "@/server/db";
import { assertCanSeeTitle } from "@/server/auth/scope";
import { route } from "@/server/http";

const PAGE = 100;

/**
 * Change history for a title (optionally one estimate row), newest first.
 * Paged: pass the previous page's `next` cursor as `before` to load older changes.
 * The cursor includes the event id because one save writes many events with the same timestamp.
 */
export const GET = route<{ isbn: string }>(async ({ request, params, session }) => {
  await assertCanSeeTitle(session, params.isbn);
  const url = new URL(request.url);
  const estimateId = url.searchParams.get("estimateId");
  const before = url.searchParams.get("before");

  const filter: Filter<EstimateEventDoc> = { isbn: params.isbn, ...(estimateId ? { estimateId } : {}) };
  if (before) {
    const [at, id] = before.split("|");
    filter.$or = [{ changedAt: { $lt: at } }, { changedAt: at, _id: { $lt: id } }];
  }

  const events = await collections.events();
  const items = await events
    .find(filter, { projection: { syncedAt: 0 } })
    .sort({ changedAt: -1, _id: -1 })
    .limit(PAGE + 1)
    .toArray();
  const more = items.length > PAGE;
  const page = more ? items.slice(0, PAGE) : items;
  const last = page[page.length - 1];
  return { items: page, next: more && last ? `${last.changedAt}|${last._id}` : null };
});
