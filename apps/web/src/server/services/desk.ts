import { visibleIsbns } from "../auth/scope";
import { COLLECTIONS } from "@seg/data";
import type { Session } from "../auth/session";
import { collections } from "../db";

/** Look-back for titles the user has never opened. */
const NEVER_VISITED_DAYS = 7;
/** Oldest change considered at all. */
const MAX_DAYS = 30;

export interface ChangedTitle {
  isbn: string;
  changes: number;
  people: { email: string; name: string }[];
  lastAt: string;
  lastBy: string;
  /** When the user last had the title open (null = never). */
  visitedAt: string | null;
}

/**
 * Titles other people changed since this user last opened them
 * (or in the last 7 days, for titles the user has never opened).
 */
export async function changedByOthers(session: Session): Promise<ChangedTitle[]> {
  const now = Date.now();
  const since = new Date(now - MAX_DAYS * 86_400_000).toISOString();
  const neverVisitedSince = new Date(now - NEVER_VISITED_DAYS * 86_400_000).toISOString();

  const rows = await (await collections.events())
    .aggregate<{ _id: string; changes: number; people: string[]; lastAt: string; lastBy: string; visitedAt: string | null }>([
      { $match: { changedAt: { $gte: since }, changedBy: { $ne: session.email } } },
      { $addFields: { visitId: { $concat: [session.email, "|", "$isbn"] } } },
      { $lookup: { from: COLLECTIONS.titleVisits, localField: "visitId", foreignField: "_id", as: "visit" } },
      { $addFields: { visitedAt: { $ifNull: [{ $first: "$visit.visitedAt" }, null] } } },
      { $match: { $expr: { $gt: ["$changedAt", { $ifNull: ["$visitedAt", neverVisitedSince] }] } } },
      { $sort: { changedAt: -1 } },
      {
        $group: {
          _id: "$isbn",
          changes: { $sum: 1 },
          people: { $addToSet: "$changedBy" },
          lastAt: { $first: "$changedAt" },
          lastBy: { $first: "$changedBy" },
          visitedAt: { $first: "$visitedAt" },
        },
      },
      { $sort: { lastAt: -1 } },
      { $limit: 200 },
    ])
    .toArray();

  const visible = await visibleIsbns(session);
  if (visible) rows.splice(0, rows.length, ...rows.filter((r) => visible.has(r._id)));
  const emails = [...new Set(rows.flatMap((r) => r.people))];
  const names = new Map(
    (await (await collections.users()).find({ _id: { $in: emails } }, { projection: { name: 1 } }).toArray()).map((u) => [u._id, u.name]),
  );
  return rows.map((r) => ({
    isbn: r._id,
    changes: r.changes,
    people: r.people.map((email) => ({ email, name: names.get(email) ?? email.split("@")[0]! })),
    lastAt: r.lastAt,
    lastBy: names.get(r.lastBy) ?? r.lastBy.split("@")[0]!,
    visitedAt: r.visitedAt,
  }));
}
