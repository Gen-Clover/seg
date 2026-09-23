/**
 * Loads the demo dataset into BigQuery (replaces the demo tables) and runs the ingestion SQL.
 *
 *   GCP_PROJECT_ID=... GOOGLE_APPLICATION_CREDENTIALS=.secrets/gcp-key.json npm run seed:bigquery
 *
 * Creates:
 *   <BQ_SOURCE_DATASET>  legacy-layout source tables (BIL_*, DIL_*, DTL_*)
 *   <BQ_APP_DATASET>     SEG_ESTIMATE_EVENTS (+ seeded history), SEG_ESTIMATES_CURRENT view,
 *                        SEG_TITLE_ACCOUNT_FACTS and SEG_TITLE_STATS (built by the ingestion SQL)
 *
 * Refuses to touch datasets whose names look like production.
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { BigQuery, type TableField } from "@google-cloud/bigquery";
import { DEFAULT_DOMAIN_CONFIG, ESTIMATE_FIELDS, estimateId, type EstimateRecord } from "@seg/domain";
import {
  COMMENTS_SCHEMA,
  COMMENTS_TABLE,
  ESTIMATE_EVENTS_SCHEMA,
  ESTIMATE_EVENTS_TABLE,
  SOURCE_TABLES,
  buildCurrentEstimatesViewSql,
  buildFactsSql,
  buildStatsSql,
  type BigQueryConfig,
  type BqField,
} from "@seg/data";
import type { SeedPlan } from "./build";
import { APP_DIR, SOURCE_DIR, loadEnv, readJson } from "./files";

const root = loadEnv();
const cfg: BigQueryConfig = {
  projectId: process.env.GCP_PROJECT_ID ?? "",
  sourceDataset: process.env.BQ_SOURCE_DATASET ?? "seg_source",
  appDataset: process.env.BQ_APP_DATASET ?? "seg_app",
  location: process.env.BQ_LOCATION ?? "US",
  minSeasonYear: DEFAULT_DOMAIN_CONFIG.minSeasonYear,
};
if (!cfg.projectId) throw new Error("Set GCP_PROJECT_ID.");
for (const ds of [cfg.sourceDataset, cfg.appDataset]) {
  if (/PROD|BUSINESS_INTELLIGENCE/i.test(ds)) throw new Error(`Refusing to load demo data into "${ds}".`);
}

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS ? resolve(root, process.env.GOOGLE_APPLICATION_CREDENTIALS) : undefined;
const credentials = process.env.GCP_KEY_BASE64 ? JSON.parse(Buffer.from(process.env.GCP_KEY_BASE64, "base64").toString("utf8")) : undefined;
if (!credentials && keyFile && !existsSync(keyFile)) throw new Error(`Key file not found: ${keyFile}`);
const bq = new BigQuery({ projectId: cfg.projectId, location: cfg.location, ...(credentials ? { credentials } : { keyFilename: keyFile }) });

const toSchema = (fields: BqField[]): TableField[] => fields.map((f) => ({ name: f.name, type: f.type, mode: f.mode ?? "NULLABLE" }));

async function ensureDataset(id: string) {
  const ds = bq.dataset(id);
  const [exists] = await ds.exists();
  if (!exists) await bq.createDataset(id, { location: cfg.location });
  return ds;
}

async function query(sql: string, label: string) {
  const started = Date.now();
  const [job] = await bq.createQueryJob({ query: sql, location: cfg.location });
  await job.getQueryResults();
  const [meta] = await job.getMetadata();
  const mb = Number(meta.statistics?.totalBytesProcessed ?? 0) / 1e6;
  console.log(`  ${label.padEnd(28)} ${((Date.now() - started) / 1000).toFixed(1)}s, ${mb.toFixed(1)} MB processed`);
}

const started = Date.now();
console.log(`Project ${cfg.projectId} (${cfg.location})`);

const source = await ensureDataset(cfg.sourceDataset);
const app = await ensureDataset(cfg.appDataset);

console.log(`Loading source tables into ${cfg.sourceDataset}…`);
for (const [table, fields] of Object.entries(SOURCE_TABLES)) {
  const file = join(SOURCE_DIR, `${table}.ndjson`);
  const t0 = Date.now();
  const [job] = await source.table(table).load(file, {
    sourceFormat: "NEWLINE_DELIMITED_JSON",
    schema: { fields: toSchema(fields) },
    writeDisposition: "WRITE_TRUNCATE",
    createDisposition: "CREATE_IF_NEEDED",
    ignoreUnknownValues: true,
  });
  const rows = job.statistics?.load?.outputRows ?? "?";
  console.log(`  ${table.padEnd(28)} ${rows} rows, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// Legacy SQL also reads BIL_MF_FACT_SD; in the demo it is the same data.
await query(
  `CREATE OR REPLACE VIEW \`${cfg.projectId}.${cfg.sourceDataset}.BIL_MF_FACT_SD\` AS SELECT * FROM \`${cfg.projectId}.${cfg.sourceDataset}.BIL_MF_FACT_SALES\``,
  "BIL_MF_FACT_SD view",
);

console.log(`Preparing ${cfg.appDataset}…`);
const eventsTable = app.table(ESTIMATE_EVENTS_TABLE);
const [eventsExists] = await eventsTable.exists();
if (eventsExists) await eventsTable.delete();
await app.createTable(ESTIMATE_EVENTS_TABLE, {
  schema: { fields: toSchema(ESTIMATE_EVENTS_SCHEMA) },
  timePartitioning: { type: "DAY", field: "changed_at" },
  clustering: { fields: ["isbn"] },
});

// Seeded history: the same events the Mongo loader creates, so both stores agree.
const estimates = readJson<EstimateRecord[]>(join(APP_DIR, "estimates.json"));
const plans = readJson<SeedPlan[]>(join(APP_DIR, "plans.json"));
const now = new Date().toISOString();
const events: Record<string, unknown>[] = [];
let seq = 0;
const latest = new Map<string, EstimateRecord>();
for (const e of estimates) latest.set(estimateId(e.isbn, e.level, e), e);
for (const e of latest.values()) {
  for (const field of ESTIMATE_FIELDS) {
    const value = e[field];
    if (value === null || value === "") continue;
    events.push({
      event_id: `seed-${String(seq++).padStart(7, "0")}`,
      isbn: e.isbn,
      level: e.level,
      distribution_channel: e.channelId,
      distribution_channel_name: e.channelName,
      organization_id: e.orgId,
      organization_name: e.orgName,
      account_number: e.accountId,
      account_name: e.accountName,
      field,
      old_value: null,
      new_value: String(value),
      changed_by: e.updatedBy ?? "seed",
      changed_at: e.updatedAt ?? now,
      source: "migration",
    });
  }
}
for (const p of plans) {
  for (const [field, value] of [["compIsbn", p.compIsbn], ["titleNotes", p.titleNotes]] as const) {
    if (!value) continue;
    events.push({
      event_id: `seed-${String(seq++).padStart(7, "0")}`,
      isbn: p.isbn, level: "title",
      distribution_channel: null, distribution_channel_name: null, organization_id: null, organization_name: null, account_number: null, account_name: null,
      field, old_value: null, new_value: value, changed_by: p.updatedBy, changed_at: p.updatedAt, source: "migration",
    });
  }
}
// A load job (free) rather than streaming inserts for the bulk history.
const { writeFileSync, mkdirSync } = await import("node:fs");
mkdirSync(join(APP_DIR, "..", "tmp"), { recursive: true });
const eventsFile = join(APP_DIR, "..", "tmp", "events.ndjson");
writeFileSync(eventsFile, events.map((e) => JSON.stringify(e)).join("\n"));
await eventsTable.load(eventsFile, { sourceFormat: "NEWLINE_DELIMITED_JSON", writeDisposition: "WRITE_APPEND" });
console.log(`  ${ESTIMATE_EVENTS_TABLE.padEnd(28)} ${events.length} seeded events`);

await query(buildCurrentEstimatesViewSql(cfg), "SEG_ESTIMATES_CURRENT view");

// Comments start empty (they refer to the titles loaded above).
const commentsTable = app.table(COMMENTS_TABLE);
if ((await commentsTable.exists())[0]) await commentsTable.delete();
await app.createTable(COMMENTS_TABLE, {
  schema: { fields: toSchema(COMMENTS_SCHEMA) },
  timePartitioning: { type: "DAY", field: "created_at" },
  clustering: { fields: ["isbn"] },
});
console.log(`  ${COMMENTS_TABLE.padEnd(28)} created (empty)`);

console.log("Running ingestion SQL…");
await query(buildFactsSql(cfg), "SEG_TITLE_ACCOUNT_FACTS");
await query(buildStatsSql(cfg), "SEG_TITLE_STATS");

console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
