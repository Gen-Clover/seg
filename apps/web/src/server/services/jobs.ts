import type { AnyBulkWriteOperation } from "mongodb";
import type { JobRunDoc, TitleDoc } from "@seg/data";
import { isTitleInScope } from "@seg/domain";
import { collections } from "../db";
import { runIngest } from "./ingest";
import { domainConfig, getSettings } from "./settings";
import { refreshTitleTotals } from "./totals";
import { refreshTrends } from "./trends";
import { runWriteback } from "./writeback";

export type JobName = JobRunDoc["job"];

/** Runs a job and records its outcome (duration, counts, error) for the admin console. */
export async function recordJob<T extends object>(job: JobName, by: string, fn: () => Promise<T>): Promise<T> {
  const started = new Date();
  const days = (await getSettings()).retention.jobHistoryDays;
  const runs = await collections.jobRuns();
  const id = `${job}-${started.toISOString()}-${Math.random().toString(36).slice(2, 7)}`;
  const base = { _id: id, job, startedAt: started.toISOString(), by, expiresAt: new Date(started.getTime() + days * 86_400_000) };
  try {
    const result = await fn();
    await runs.insertOne({ ...base, finishedAt: new Date().toISOString(), ok: true, detail: { ...result, ms: Date.now() - started.getTime() }, error: null });
    return result;
  } catch (err) {
    await runs.insertOne({
      ...base,
      finishedAt: new Date().toISOString(),
      ok: false,
      detail: { ms: Date.now() - started.getTime() },
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Applies changed business rules: recomputes which titles are in scope and every title's totals
 * with the current rules. A new first season year also needs the BigQuery ingestion SQL, so
 * that case runs the full data refresh instead.
 */
export async function applyRules(by: string): Promise<{ mode: "recompute" | "full-refresh"; inScope: number; changed: number; totals: number }> {
  const config = await domainConfig();
  const lastIngest = await (await collections.jobRuns()).find({ job: "ingest", ok: true }).sort({ startedAt: -1 }).limit(1).next();
  const ranWith = (lastIngest?.detail as { minSeasonYear?: number } | undefined)?.minSeasonYear;
  if (ranWith !== undefined && ranWith !== config.minSeasonYear) {
    await recordJob("ingest", by, () => runIngest({ rebuildSql: true }));
  }
  const titles = await collections.titles();
  const docs = await titles.find({}, { projection: { _id: 1, isbn: 1, season: 1, ipmFormat: 1, format: 1, division: 1, imprint: 1, inScope: 1, "plan.compIsbn": 1 } }).toArray();
  const ops: AnyBulkWriteOperation<TitleDoc>[] = [];
  let inScope = 0;
  for (const t of docs) {
    const next = isTitleInScope({ isbn: t.isbn, season: t.season, ipmFormat: t.ipmFormat, format: t.format, division: t.division, imprint: t.imprint }, config);
    if (next) inScope++;
    if (next !== t.inScope) ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { inScope: next } } } });
  }
  if (ops.length) await titles.bulkWrite(ops, { ordered: false });
  // Totals use the grid rules (e.g. which channels expand to accounts).
  let totals = 0;
  for (const t of docs) {
    await refreshTitleTotals(t._id, t.plan?.compIsbn ?? null);
    totals++;
  }
  await refreshTrends();
  return { mode: ranWith !== undefined && ranWith !== config.minSeasonYear ? "full-refresh" : "recompute", inScope, changed: ops.length, totals };
}

export async function runJobNow(job: "ingest" | "writeback" | "trends" | "apply-rules", by: string) {
  switch (job) {
    case "ingest":
      return recordJob("ingest", by, () => runIngest({ rebuildSql: true }));
    case "writeback":
      return recordJob("writeback", by, () => runWriteback());
    case "trends":
      return recordJob("trends", by, () => refreshTrends());
    case "apply-rules":
      return recordJob("apply-rules", by, () => applyRules(by));
  }
}

/** Last run of each job plus recent history (optionally one job). */
export async function jobOverview(filter: { job?: string; limit?: number }) {
  const runs = await collections.jobRuns();
  const names: JobName[] = ["ingest", "writeback", "trends", "apply-rules", "bulk", "demo-reset", "seed"];
  const last = await Promise.all(names.map((job) => runs.find({ job }).sort({ startedAt: -1 }).limit(1).next()));
  const history = await runs
    .find(filter.job ? { job: filter.job as JobName } : {})
    .sort({ startedAt: -1 })
    .limit(Math.min(filter.limit ?? 100, 500))
    .toArray();
  return { last: Object.fromEntries(names.map((n, i) => [n, last[i] ?? null])), history, retentionDays: (await getSettings()).retention.jobHistoryDays };
}

/** Deletes job records older than the retention period (also applied automatically to new runs). */
export async function purgeJobHistory(): Promise<number> {
  const days = (await getSettings()).retention.jobHistoryDays;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return (await (await collections.jobRuns()).deleteMany({ startedAt: { $lt: cutoff } })).deletedCount;
}
