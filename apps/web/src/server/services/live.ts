import type { Filter } from "mongodb";
import type { EstimateDoc, EstimateEventDoc, TitleDoc } from "@seg/data";
import type { Session } from "../auth/session";
import { collections } from "../db";

/** Presence older than this is treated as gone (heartbeats arrive every few seconds). */
const PRESENCE_WINDOW_MS = 25_000;
const EPOCH_CURSOR = "1970-01-01T00:00:00.000Z|";

export interface Viewer {
  email: string;
  name: string;
  /** Cell being edited ("<estimateId>|<field>") or null. */
  cell: string | null;
}

export interface LiveChange {
  estimateId: string;
  level: EstimateEventDoc["level"];
  field: string;
  changedBy: string;
  changedAt: string;
}

export interface LiveTick {
  cursor: string;
  viewers: Viewer[];
  /** Saved changes by other people since the previous cursor. */
  changes: LiveChange[];
  /** Current versions of the rows those changes touched. */
  estimates: EstimateDoc[];
  totals: TitleDoc["totals"] | null;
  plan: TitleDoc["plan"] | null;
  /** Changes whenever a comment on this title is added or removed. */
  commentsVersion: string;
}

/**
 * One heartbeat from a browser showing a title (every few seconds while visible):
 * records presence and the visit, and returns other viewers plus everything others saved since `cursor`.
 * Polling keeps this free of extra services and works on serverless hosting.
 */
export async function liveTick(isbn: string, session: Session, cursor: string | null, cell: string | null): Promise<LiveTick> {
  const now = new Date();
  const [presence, visits, events, comments] = await Promise.all([
    collections.presence(),
    collections.visits(),
    collections.events(),
    collections.comments(),
  ]);

  await Promise.all([
    presence.updateOne(
      { _id: `${isbn}|${session.email}` },
      { $set: { isbn, email: session.email, name: session.name, cell, seenAt: now } },
      { upsert: true },
    ),
    visits.updateOne(
      { _id: `${session.email}|${isbn}` },
      { $set: { email: session.email, isbn, visitedAt: now.toISOString() } },
      { upsert: true },
    ),
  ]);

  const [viewers, newEvents, commentsVersion] = await Promise.all([
    presence
      .find({ isbn, email: { $ne: session.email }, seenAt: { $gte: new Date(now.getTime() - PRESENCE_WINDOW_MS) } })
      .project<Viewer>({ _id: 0, email: 1, name: 1, cell: 1 })
      .sort({ name: 1 })
      .toArray(),
    cursor ? eventsAfter(events, isbn, cursor) : Promise.resolve(null),
    comments
      .aggregate<{ n: number; created: string | null; deleted: string | null }>([
        { $match: { isbn } },
        { $group: { _id: null, n: { $sum: 1 }, created: { $max: "$createdAt" }, deleted: { $max: "$deletedAt" } } },
      ])
      .toArray()
      .then(([v]) => (v ? `${v.n}|${v.created}|${v.deleted}` : "0")),
  ]);

  // First tick: start from the latest event, report nothing.
  if (!newEvents) {
    const [latest] = await events.find({ isbn }, { projection: { _id: 1, changedAt: 1 } }).sort({ changedAt: -1, _id: -1 }).limit(1).toArray();
    return {
      cursor: latest ? `${latest.changedAt}|${latest._id}` : EPOCH_CURSOR,
      viewers,
      changes: [],
      estimates: [],
      totals: null,
      plan: null,
      commentsVersion,
    };
  }

  const last = newEvents[newEvents.length - 1];
  const next = last ? `${last.changedAt}|${last._id}` : cursor!;
  const others = newEvents.filter((e) => e.changedBy !== session.email);
  if (!others.length) return { cursor: next, viewers, changes: [], estimates: [], totals: null, plan: null, commentsVersion };

  const rowIds = [...new Set(others.filter((e) => e.level !== "title").map((e) => e.estimateId))];
  const [estimates, title] = await Promise.all([
    rowIds.length ? (await collections.estimates()).find({ _id: { $in: rowIds } }).toArray() : Promise.resolve([] as EstimateDoc[]),
    (await collections.titles()).findOne({ _id: isbn }, { projection: { totals: 1, plan: 1 } }),
  ]);
  return {
    cursor: next,
    viewers,
    changes: others.map((e) => ({ estimateId: e.estimateId, level: e.level, field: e.field, changedBy: e.changedBy, changedAt: e.changedAt })),
    estimates,
    totals: title?.totals ?? null,
    plan: others.some((e) => e.level === "title") ? (title?.plan ?? null) : null,
    commentsVersion,
  };
}

async function eventsAfter(
  events: Awaited<ReturnType<typeof collections.events>>,
  isbn: string,
  cursor: string,
): Promise<EstimateEventDoc[]> {
  const [at, id = ""] = cursor.split("|");
  const filter: Filter<EstimateEventDoc> = { isbn, $or: [{ changedAt: { $gt: at } }, { changedAt: at, _id: { $gt: id } }] };
  return events.find(filter, { projection: { syncedAt: 0 } }).sort({ changedAt: 1, _id: 1 }).limit(500).toArray();
}
