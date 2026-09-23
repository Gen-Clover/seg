/**
 * Cross-checks the BigQuery ingestion SQL against the JavaScript port (derive.ts):
 * both must produce the same per-title × account figures and title stats.
 *
 *   npm run verify:bigquery -w @seg/seed
 */
import { join, resolve } from "node:path";
import { BigQuery } from "@google-cloud/bigquery";
import { FACTS_TABLE, STATS_TABLE } from "@seg/data";
import { DERIVED_DIR, loadEnv, readNdjson } from "./files";

const root = loadEnv();
const project = process.env.GCP_PROJECT_ID!;
const dataset = process.env.BQ_APP_DATASET ?? "seg_app";
const bq = new BigQuery({ projectId: project, keyFilename: resolve(root, process.env.GOOGLE_APPLICATION_CREDENTIALS ?? "") });

const key = (r: Record<string, unknown>) =>
  [r.ISBN, r.DISTRIBUTION_CHANNEL, r.DISTRIBUTION_CHANNEL_NAME, r.ORGANIZATION_ID, r.ORG_NAME, r.ACCOUNT_NBR, r.ACCOUNT_NAME].map((v) => v ?? "").join("|");
const val = (r: Record<string, unknown>) =>
  [r.INITIAL_ORDER, r.GROSS_UNITS, r.NET_UNITS, r.READERLINK_POS, r.IN_TITLE_LIST, r.IN_COMP_LIST].map((v) => String(Number(v === true ? 1 : v === false ? 0 : v ?? 0))).join("|");

const [sqlFacts] = await bq.query({ query: `SELECT * FROM \`${project}.${dataset}.${FACTS_TABLE}\`` });
const jsFacts = readNdjson(join(DERIVED_DIR, "SEG_TITLE_ACCOUNT_FACTS.ndjson"));
const sqlMap = new Map(sqlFacts.map((r: Record<string, unknown>) => [key(r), val(r)]));
const jsMap = new Map(jsFacts.map((r) => [key(r), val(r)]));

let missingInSql = 0, missingInJs = 0, different = 0;
const examples: string[] = [];
for (const [k, v] of jsMap) {
  if (!sqlMap.has(k)) missingInSql++;
  else if (sqlMap.get(k) !== v) {
    different++;
    if (examples.length < 5) examples.push(`${k}\n    js=${v}\n    sql=${sqlMap.get(k)}`);
  }
}
for (const k of sqlMap.keys()) if (!jsMap.has(k)) missingInJs++;
console.log(`facts: sql=${sqlMap.size} js=${jsMap.size} missingInSql=${missingInSql} missingInJs=${missingInJs} different=${different}`);
examples.forEach((e) => console.log("  " + e));

const [sqlStats] = await bq.query({ query: `SELECT * FROM \`${project}.${dataset}.${STATS_TABLE}\`` });
const jsStats = new Map(readNdjson(join(DERIVED_DIR, "SEG_TITLE_STATS.ndjson")).map((r) => [String(r.ISBN), r]));
let statDiff = 0;
for (const s of sqlStats as Record<string, unknown>[]) {
  const j = jsStats.get(String(s.ISBN));
  const norm = (x: unknown) => (x === null || x === undefined ? "null" : String(Number(x)));
  if (!j || ["LTD_GROSS_UNITS", "EBOOK_UNITS"].some((f) => norm(s[f]) !== norm(j[f])) || (s.HAS_BOOKSCAN && norm(s.BOOKSCAN_LTD) !== norm(j.BOOKSCAN_LTD))) {
    statDiff++;
    if (statDiff <= 3) console.log("  stat diff", s, j);
  }
}
console.log(`stats: sql=${sqlStats.length} js=${jsStats.size} different=${statDiff}`);
process.exit(missingInSql || missingInJs || different || statDiff ? 1 : 0);
