import type { Filter } from "mongodb";
import type { EstimateEventDoc, SignInDoc } from "@seg/data";
import { collections } from "../../db";

export interface ActivityFilter {
  person?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD (inclusive)
  season?: string;
  field?: string;
  source?: string;
  isbn?: string;
  before?: string; // cursor "<changedAt>|<_id>"
  limit?: number;
}

const FIELD_LABEL: Record<string, string> = {
  laydownGoal: "Laydown goal",
  laydownEstimate: "Laydown estimate",
  sixMonthEstimate: "6-month estimate",
  salesNotes: "Sales notes",
  compIsbn: "Comparable title",
  titleNotes: "Title notes",
};

async function activityQuery(f: ActivityFilter): Promise<Filter<EstimateEventDoc>> {
  const q: Filter<EstimateEventDoc> = {};
  if (f.person) q.changedBy = f.person;
  if (f.field) q.field = f.field;
  if (f.source) q.source = f.source as EstimateEventDoc["source"];
  if (f.isbn) q.isbn = f.isbn;
  if (f.from || f.to) q.changedAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: nextDay(f.to) } : {}) };
  if (f.season) {
    const isbns = await (await collections.titles()).distinct("_id", { season: f.season });
    q.isbn = f.isbn ? (isbns.includes(f.isbn) ? f.isbn : "__none__") : { $in: isbns };
  }
  if (f.before) {
    const [at, id] = f.before.split("|");
    q.$or = [{ changedAt: { $lt: at } }, { changedAt: at, _id: { $lt: id } }];
  }
  return q;
}
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Every change across all titles, newest first, with title names and people's names. */
export async function activity(f: ActivityFilter) {
  const limit = Math.min(f.limit ?? 100, 500);
  const events = await (await collections.events())
    .find(await activityQuery(f), { projection: { syncedAt: 0 } })
    .sort({ changedAt: -1, _id: -1 })
    .limit(limit + 1)
    .toArray();
  const page = events.slice(0, limit);
  const [titles, users] = await Promise.all([
    (await collections.titles()).find({ _id: { $in: [...new Set(page.map((e) => e.isbn))] } }, { projection: { title: 1, season: 1 } }).toArray(),
    (await collections.users()).find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const titleBy = new Map(titles.map((t) => [t._id, t]));
  const nameBy = new Map(users.map((u) => [u._id, u.name]));
  const last = page[page.length - 1];
  return {
    items: page.map((e) => ({
      id: e._id,
      at: e.changedAt,
      person: e.changedBy,
      personName: nameBy.get(e.changedBy) ?? e.changedBy.split("@")[0],
      isbn: e.isbn,
      title: titleBy.get(e.isbn)?.title ?? e.isbn,
      season: titleBy.get(e.isbn)?.season ?? null,
      level: e.level,
      row: e.level === "title" ? "Title" : (e.accountName ?? e.orgName ?? e.channelName ?? ""),
      field: e.field,
      fieldLabel: FIELD_LABEL[e.field] ?? e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      source: e.source,
    })),
    next: events.length > limit && last ? `${last.changedAt}|${last._id}` : null,
  };
}

/** Options for the activity filters (people, fields, sources, seasons). */
export async function activityFacets() {
  const events = await collections.events();
  const [people, fields, sources, seasons, users] = await Promise.all([
    events.distinct("changedBy"),
    events.distinct("field"),
    events.distinct("source"),
    (await collections.titles()).distinct("season", { inScope: true }),
    (await collections.users()).find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const nameBy = new Map(users.map((u) => [u._id, u.name]));
  return {
    people: people.sort().map((p) => ({ value: p, label: nameBy.get(p) ?? p })),
    fields: fields.map((f) => ({ value: f, label: FIELD_LABEL[f] ?? f })),
    sources,
    seasons: (seasons.filter(Boolean) as string[]).sort(),
  };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the filtered activity (up to 50,000 rows). */
export async function activityCsv(f: ActivityFilter): Promise<string> {
  const rows: string[] = [["Date", "Person", "ISBN", "Title", "Season", "Level", "Row", "Field", "Old value", "New value", "Source"].join(",")];
  let before: string | undefined = undefined;
  for (let i = 0; i < 100; i++) {
    const page: Awaited<ReturnType<typeof activity>> = await activity({ ...f, before, limit: 500 });
    for (const e of page.items) {
      rows.push([e.at, e.personName, e.isbn, e.title, e.season, e.level, e.row, e.fieldLabel, e.oldValue, e.newValue, e.source].map(csvCell).join(","));
    }
    if (!page.next) break;
    before = page.next;
  }
  return "﻿" + rows.join("\r\n");
}

export async function uploadLog(limit = 200) {
  return (await collections.uploadLogs()).find({}).sort({ startedAt: -1 }).limit(limit).toArray();
}

export async function signInLog(f: { email?: string; ok?: string; limit?: number }) {
  const q: Filter<SignInDoc> = {};
  if (f.email) q.email = f.email.toLowerCase();
  if (f.ok === "yes") q.ok = true;
  if (f.ok === "no") q.ok = false;
  const signIns = await collections.signIns();
  const [items, failed24h] = await Promise.all([
    signIns.find(q, { projection: { expiresAt: 0 } }).sort({ at: -1 }).limit(Math.min(f.limit ?? 300, 1000)).toArray(),
    signIns.countDocuments({ ok: false, at: { $gte: new Date(Date.now() - 86_400_000).toISOString() } }),
  ]);
  return { items, failed24h };
}

export async function adminAuditLog(limit = 200) {
  return (await collections.adminAudit()).find({}).sort({ at: -1 }).limit(limit).toArray();
}
