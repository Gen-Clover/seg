import type { AnyBulkWriteOperation } from "mongodb";
import {
  CURRENT_ESTIMATES_VIEW,
  FACTS_TABLE,
  INDEXES,
  STATS_TABLE,
  accountFromRow,
  buildAccountsSql,
  buildFactsSql,
  buildStatsSql,
  buildTitlesSql,
  computeTitleTotals,
  factFromRow,
  newTitleDoc,
  titleFromBookRow,
  type AccountDoc,
  type EstimateDoc,
  type TitleAccountFactDoc,
  type TitleDoc,
  type UserDoc,
} from "@seg/data";
import { hashPassword } from "@seg/data/password";
import { clean, estimateId, normalizeAccount, refForLevel, type Level } from "@seg/domain";
import { bigquery, bigQueryConfig } from "../bigquery";
import { collections, db } from "../db";
import { domainConfig, env } from "../env";

type Row = Record<string, unknown>;

async function query(sql: string): Promise<Row[]> {
  const [rows] = await bigquery().query({ query: sql, location: bigQueryConfig().location });
  return rows as Row[];
}

async function chunked<T>(items: T[], size: number, fn: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

export interface IngestResult {
  titles: number;
  facts: number;
  accounts: number;
  restoredEstimates: number;
  restoredPlans: number;
  seededUsers: number;
  totalsRecomputed: number;
  ms: number;
}

/**
 * Rebuilds MongoDB's reference data from BigQuery (the source of truth):
 *  1. optionally re-runs the ingestion SQL (facts + stats for every title),
 *  2. loads catalog, stats, title × account facts and valid accounts,
 *  3. on an empty database, restores estimates and title plans from SEG_ESTIMATES_CURRENT,
 *  4. recomputes every title's summary totals.
 * App-owned data already in MongoDB is never overwritten.
 */
export async function runIngest(options: { rebuildSql: boolean }): Promise<IngestResult> {
  const started = Date.now();
  const cfg = bigQueryConfig();
  const project = `\`${cfg.projectId}.${cfg.appDataset}`;

  if (options.rebuildSql) {
    await query(buildFactsSql(cfg));
    await query(buildStatsSql(cfg));
  }

  const [bookRows, statRows, factRows, accountRows] = await Promise.all([
    query(buildTitlesSql(cfg)),
    query(`SELECT * FROM ${project}.${STATS_TABLE}\``),
    query(`SELECT * FROM ${project}.${FACTS_TABLE}\``),
    query(buildAccountsSql(cfg)),
  ]);

  const database = await db();
  for (const [name, specs] of Object.entries(INDEXES)) {
    for (const idx of specs) await database.collection(name).createIndex(idx.key, { name: idx.name, ...(idx.unique ? { unique: true } : {}) });
  }

  const now = new Date().toISOString();
  const config = domainConfig();
  const statsByIsbn = new Map(statRows.map((s) => [String(s.ISBN), s]));

  // 1. Titles: refresh reference fields, keep app-owned plan/totals.
  const titles = await collections.titles();
  const refs = bookRows.filter((b) => clean(b.EAN)).map((b) => titleFromBookRow(b, statsByIsbn.get(String(b.EAN).trim()), now, config));
  await chunked(refs, 1000, (chunk) =>
    titles.bulkWrite(
      chunk.map((r) => {
        const fresh = newTitleDoc(r);
        return {
          updateOne: {
            filter: { _id: r._id },
            update: { $set: r, $setOnInsert: { plan: fresh.plan, totals: fresh.totals } },
            upsert: true,
          },
        } satisfies AnyBulkWriteOperation<TitleDoc>;
      }),
      { ordered: false },
    ),
  );

  // 2. Facts and accounts: replaced wholesale (pure reference data).
  const facts: TitleAccountFactDoc[] = factRows.map(factFromRow);
  const factsCol = await collections.facts();
  await factsCol.deleteMany({});
  await chunked(facts, 5000, (chunk) => factsCol.insertMany(chunk, { ordered: false }));

  const accounts = accountRows.map(accountFromRow).filter((a): a is AccountDoc => a !== null);
  const accountsCol = await collections.accounts();
  await accountsCol.deleteMany({});
  const uniqueAccounts = [...new Map(accounts.map((a) => [a._id, a])).values()];
  await chunked(uniqueAccounts, 2000, (chunk) => accountsCol.insertMany(chunk, { ordered: false }));

  // 3. Restore app data from BigQuery when MongoDB has none (fresh or rebuilt database).
  const estimatesCol = await collections.estimates();
  let restoredEstimates = 0;
  let restoredPlans = 0;
  if ((await estimatesCol.estimatedDocumentCount()) === 0) {
    const current = await query(`SELECT * FROM ${project}.${CURRENT_ESTIMATES_VIEW}\``);
    const estimates: EstimateDoc[] = [];
    const plans: AnyBulkWriteOperation<TitleDoc>[] = [];
    for (const r of current) {
      const isbn = String(r.isbn);
      const updatedAt = r.updated_at && typeof r.updated_at === "object" ? String((r.updated_at as Row).value) : String(r.updated_at ?? now);
      const updatedBy = String(r.updated_by ?? "bigquery");
      if (r.level === "title") {
        plans.push({
          updateOne: {
            filter: { _id: isbn },
            update: { $set: { "plan.compIsbn": clean(r.comp_isbn), "plan.titleNotes": String(r.title_notes ?? ""), "plan.updatedAt": updatedAt, "plan.updatedBy": updatedBy } },
          },
        });
        continue;
      }
      const level = r.level as Level;
      const ref = refForLevel(
        level,
        normalizeAccount({
          channelId: clean(r.distribution_channel),
          channelName: clean(r.distribution_channel_name),
          orgId: clean(r.organization_id),
          orgName: clean(r.organization_name),
          accountId: clean(r.account_number),
          accountName: clean(r.account_name),
        }),
      );
      const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      estimates.push({
        _id: estimateId(isbn, level, ref),
        isbn,
        level,
        ...ref,
        laydownGoal: num(r.laydown_goal),
        laydownEstimate: num(r.laydown_estimate),
        sixMonthEstimate: num(r.six_month_estimate),
        salesNotes: String(r.sales_notes ?? ""),
        updatedAt,
        updatedBy,
      });
    }
    await chunked(estimates, 2000, (chunk) => estimatesCol.insertMany(chunk, { ordered: false }));
    await chunked(plans, 1000, (chunk) => titles.bulkWrite(chunk, { ordered: false }));
    restoredEstimates = estimates.length;
    restoredPlans = plans.length;
  }

  // 4. Demo users when the users collection is empty (production signs in with Entra ID).
  let seededUsers = 0;
  const users = await collections.users();
  const demoPassword = env().DEMO_PASSWORD;
  if (env().AUTH_PROVIDER === "credentials" && demoPassword && (await users.estimatedDocumentCount()) === 0) {
    const demo: [string, string, UserDoc["role"]][] = [
      ["admin@seg-demo.com", "Alex Morgan", "admin"],
      ["editor@seg-demo.com", "Jordan Lee", "editor"],
      ["viewer@seg-demo.com", "Sam Rivera", "viewer"],
    ];
    for (const [email, name, role] of demo) {
      await users.insertOne({ _id: email, email, name, role, passwordHash: await hashPassword(demoPassword), active: true, createdAt: now });
    }
    seededUsers = demo.length;
  }

  // 5. Recompute stored totals for every title (facts may have changed).
  const factsByIsbn = new Map<string, TitleAccountFactDoc[]>();
  for (const f of facts) {
    const list = factsByIsbn.get(f.isbn);
    if (list) list.push(f);
    else factsByIsbn.set(f.isbn, [f]);
  }
  const estimatesByIsbn = new Map<string, EstimateDoc[]>();
  for (const e of await estimatesCol.find({}).toArray()) {
    const list = estimatesByIsbn.get(e.isbn);
    if (list) list.push(e);
    else estimatesByIsbn.set(e.isbn, [e]);
  }
  const planDocs = await titles.find({}, { projection: { _id: 1, "plan.compIsbn": 1 } }).toArray();
  const totalOps: AnyBulkWriteOperation<TitleDoc>[] = planDocs.map((t) => {
    const comp = t.plan?.compIsbn ?? null;
    const totals = computeTitleTotals(factsByIsbn.get(t._id) ?? [], comp ? factsByIsbn.get(comp) ?? [] : null, estimatesByIsbn.get(t._id) ?? [], config);
    return { updateOne: { filter: { _id: t._id }, update: { $set: { totals } } } };
  });
  await chunked(totalOps, 1000, (chunk) => titles.bulkWrite(chunk, { ordered: false }));

  const result: IngestResult = {
    titles: refs.length,
    facts: facts.length,
    accounts: uniqueAccounts.length,
    restoredEstimates,
    restoredPlans,
    seededUsers,
    totalsRecomputed: totalOps.length,
    ms: Date.now() - started,
  };
  await (await collections.jobRuns()).insertOne({
    _id: `ingest-${now}`,
    job: "ingest",
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    ok: true,
    detail: { ...result },
  });
  return result;
}
