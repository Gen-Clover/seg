/** Prints a coverage report of the generated demo data against the business rules. */
import { join } from "node:path";
import { buildTitleGrid, DEFAULT_DOMAIN_CONFIG } from "@seg/domain";
import { factFromRow, gridInput, titleFromBookRow, type EstimateDoc, type TitleAccountFactDoc } from "@seg/data";
import { estimateId } from "@seg/domain";
import type { EstimateRecord } from "@seg/domain";
import { APP_DIR, DERIVED_DIR, SOURCE_DIR, readJson, readNdjson } from "./files";
import type { SeedPlan } from "./build";

const books = readNdjson(join(SOURCE_DIR, "BIL_BOOKATTRIBUTES.ndjson"));
const stats = new Map(readNdjson(join(DERIVED_DIR, "SEG_TITLE_STATS.ndjson")).map((s) => [String(s.ISBN), s]));
const facts = readNdjson(join(DERIVED_DIR, "SEG_TITLE_ACCOUNT_FACTS.ndjson")).map(factFromRow);
const estimates = readJson<EstimateRecord[]>(join(APP_DIR, "estimates.json"));
const plans = readJson<SeedPlan[]>(join(APP_DIR, "plans.json"));

const titles = books.map((b) => titleFromBookRow(b, stats.get(String(b.EAN)), "now"));
const inScope = titles.filter((t) => t.inScope);
const factsByIsbn = new Map<string, TitleAccountFactDoc[]>();
for (const f of facts) factsByIsbn.set(f.isbn, [...(factsByIsbn.get(f.isbn) ?? []), f]);
const estByIsbn = new Map<string, EstimateDoc[]>();
for (const e of estimates) estByIsbn.set(e.isbn, [...(estByIsbn.get(e.isbn) ?? []), { ...e, _id: estimateId(e.isbn, e.level, e), updatedAt: e.updatedAt ?? "", updatedBy: e.updatedBy ?? "" }]);
const planByIsbn = new Map(plans.map((p) => [p.isbn, p]));

const count = (pred: (x: never) => boolean, list: unknown[]) => list.filter(pred as (x: unknown) => boolean).length;
const bySeason = new Map<string, number>();
for (const t of inScope) bySeason.set(t.season ?? "-", (bySeason.get(t.season ?? "-") ?? 0) + 1);

let rowsTotal = 0;
let maxRows = 0;
let withCompOnly = 0;
let channelOverride = 0;
let mixedOrg = 0;
const levels = { channel: 0, org: 0, account: 0 };
for (const e of estimates) levels[e.level]++;

for (const t of inScope) {
  const plan = planByIsbn.get(t.isbn);
  const grid = buildTitleGrid(
    gridInput(factsByIsbn.get(t.isbn) ?? [], plan?.compIsbn ? factsByIsbn.get(plan.compIsbn) ?? [] : null, estByIsbn.get(t.isbn) ?? [], DEFAULT_DOMAIN_CONFIG),
  );
  const rows = grid.channels.reduce((s, c) => s + 1 + c.orgs.length + (c.accountLevel ? c.accountCount : 0), 0);
  rowsTotal += rows;
  maxRows = Math.max(maxRows, rows);
  if (grid.channels.some((c) => c.orgs.some((o) => o.accounts.some((a) => a.compOnly)))) withCompOnly++;
  if (grid.channels.some((c) => c.own.laydownGoal !== null && c.orgs.some((o) => o.rolled.laydownGoal !== null))) channelOverride++;
  if (grid.channels.some((c) => c.orgs.some((o) => o.own.laydownGoal !== null && o.accounts.some((a) => a.own.laydownGoal !== null)))) mixedOrg++;
}

console.log({
  catalogRows: titles.length,
  inScopeTitles: inScope.length,
  bySeason: Object.fromEntries([...bySeason].sort()),
  outOfScope: titles.length - inScope.length,
  ebookEditions: count((t: { ipmFormat: string }) => t.ipmFormat === "EB", titles),
  inScopeWithEbookSales: count((t: { stats: { ebookUnits: number | null } }) => (t.stats.ebookUnits ?? 0) > 0, inScope),
  inScopeWithBookscan: count((t: { stats: { bookscanLtd: number | null } }) => t.stats.bookscanLtd !== null, inScope),
  inScopeMissingPaperCutOff: count((t: { paperCutOff: string | null }) => !t.paperCutOff, inScope),
  gridRowsAvg: Math.round(rowsTotal / inScope.length),
  gridRowsMax: maxRows,
  titlesWithCompOnlyAccounts: withCompOnly,
  titlesWithChannelOverride: channelOverride,
  titlesWithOrgOverride: mixedOrg,
  estimatesByLevel: levels,
  titlesWithComp: count((p: SeedPlan) => !!p.compIsbn, plans),
  titlesWithNotes: count((p: SeedPlan) => !!p.titleNotes, plans),
  zeroInitialOrderTitles: count((t: { isbn: string }) => !(factsByIsbn.get(t.isbn) ?? []).some((f) => f.initialOrder > 0), inScope),
});
