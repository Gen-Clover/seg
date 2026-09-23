import { toAccountFacts, type EstimateDoc, type TitleAccountFactDoc, type TrendsDoc } from "@seg/data";
import { totalsAtPoints, weeklyPoints, type EstimateRecord, type HistoryChange } from "@seg/domain";
import { collections } from "../db";
import { domainConfig } from "../env";

const WEEKS = 12;
/** Recompute when the stored series is older than this (the nightly job normally refreshes it). */
const MAX_AGE_MS = 26 * 3600_000;

export type TrendsView = Omit<TrendsDoc, "_id">;

/**
 * Weekly laydown goal / estimate / 6-month totals per in-scope title for the last 12 weeks,
 * rebuilt from today's estimates and the change history with the normal roll-up rules.
 * Derived data: stored in MongoDB only and recomputed nightly (or on demand).
 */
export async function refreshTrends(now = new Date()): Promise<{ titles: number }> {
  const points = weeklyPoints(now, WEEKS);
  const [titlesCol, factsCol, estimatesCol, eventsCol] = await Promise.all([
    collections.titles(),
    collections.facts(),
    collections.estimates(),
    collections.events(),
  ]);
  const titles = await titlesCol.find({ inScope: true }, { projection: { _id: 1 } }).toArray();
  const isbns = titles.map((t) => t._id);

  const [facts, estimates, events] = await Promise.all([
    factsCol.find({ isbn: { $in: isbns }, inTitleList: true }).toArray(),
    estimatesCol.find({ isbn: { $in: isbns } }).toArray(),
    eventsCol
      .find(
        { isbn: { $in: isbns }, level: { $ne: "title" }, changedAt: { $gt: points[0]! } },
        { projection: { isbn: 1, level: 1, field: 1, oldValue: 1, changedAt: 1, channelId: 1, channelName: 1, orgId: 1, orgName: 1, accountId: 1, accountName: 1 } },
      )
      .toArray(),
  ]);

  const factsBy = group(facts, (f) => f.isbn);
  const estimatesBy = group(estimates, (e) => e.isbn);
  const historyBy = group(events, (e) => e.isbn);
  const config = domainConfig();

  const series: TrendsDoc["series"] = {};
  for (const isbn of isbns) {
    const history: HistoryChange[] = (historyBy.get(isbn) ?? []).map((e) => ({
      level: e.level as HistoryChange["level"],
      ref: { channelId: e.channelId, channelName: e.channelName, orgId: e.orgId, orgName: e.orgName, accountId: e.accountId, accountName: e.accountName },
      field: e.field,
      oldValue: e.oldValue,
      changedAt: e.changedAt,
    }));
    const s = totalsAtPoints({
      isbn,
      facts: toAccountFacts(factsBy.get(isbn) ?? ([] as TitleAccountFactDoc[])),
      compFacts: null, // comparable figures do not affect estimate totals
      estimates: (estimatesBy.get(isbn) ?? ([] as EstimateDoc[])) as EstimateRecord[],
      history,
      points,
      config,
    });
    if (s.laydownGoal.some((v) => v !== null) || s.laydownEstimate.some((v) => v !== null) || s.sixMonthEstimate.some((v) => v !== null)) {
      series[isbn] = [s.laydownGoal, s.laydownEstimate, s.sixMonthEstimate];
    }
  }

  await (await collections.trends()).replaceOne(
    { _id: "weekly" },
    { points, series, computedAt: now.toISOString() },
    { upsert: true },
  );
  return { titles: Object.keys(series).length };
}

export async function getTrends(): Promise<TrendsView> {
  const trends = await collections.trends();
  let doc = await trends.findOne({ _id: "weekly" });
  if (!doc || Date.now() - new Date(doc.computedAt).getTime() > MAX_AGE_MS) {
    await refreshTrends();
    doc = await trends.findOne({ _id: "weekly" });
  }
  const { points, series, computedAt } = doc!;
  return { points, series, computedAt };
}

function group<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
