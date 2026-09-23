/**
 * Generates the demo dataset into packages/seed/output/.
 *
 *   npm run seed:generate                    # as of today
 *   npm run seed:generate -- 2026-09-23      # as of a fixed date (reproducible)
 */
import { join } from "node:path";
import { DEFAULT_DOMAIN_CONFIG } from "@seg/domain";
import { buildDataset } from "./build";
import { deriveAccounts, deriveFacts, deriveStats } from "./derive";
import { APP_DIR, DERIVED_DIR, OUTPUT_DIR, SOURCE_DIR, writeJson, writeNdjson } from "./files";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

// npm drops unknown flags, so a bare YYYY-MM-DD argument is accepted too.
const asOfText = arg("as-of") ?? process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const asOf = asOfText ? new Date(`${asOfText}T00:00:00Z`) : new Date();
const started = Date.now();
const data = buildDataset({ asOf });

for (const [table, rows] of Object.entries(data.source)) writeNdjson(join(SOURCE_DIR, `${table}.ndjson`), rows);

const facts = deriveFacts(data.source, { today: data.asOf, minSeasonYear: DEFAULT_DOMAIN_CONFIG.minSeasonYear });
const stats = deriveStats(data.source);
const accounts = deriveAccounts(data.source);
writeNdjson(join(DERIVED_DIR, "SEG_TITLE_ACCOUNT_FACTS.ndjson"), facts);
writeNdjson(join(DERIVED_DIR, "SEG_TITLE_STATS.ndjson"), stats);
writeNdjson(join(DERIVED_DIR, "ACCOUNTS.ndjson"), accounts);

writeJson(join(APP_DIR, "estimates.json"), data.estimates);
writeJson(join(APP_DIR, "plans.json"), data.plans);
writeJson(join(APP_DIR, "users.json"), data.users);

const manifest = {
  asOf: data.asOf,
  generatedAt: new Date().toISOString(),
  source: Object.fromEntries(Object.entries(data.source).map(([t, rows]) => [t, rows.length])),
  derived: { facts: facts.length, stats: stats.length, accounts: accounts.length },
  app: { estimates: data.estimates.length, plans: data.plans.length, users: data.users.length },
};
writeJson(join(OUTPUT_DIR, "manifest.json"), manifest);
console.log(JSON.stringify(manifest, null, 2));
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s → ${OUTPUT_DIR}`);
