/**
 * Loads the generated demo data into MongoDB (replaces everything).
 *
 *   MONGODB_URI=... npm run seed:mongo
 *
 * Reference collections are built from the derived files with the same mapping the production
 * ingestion job uses. App data (estimates, plans) and demo users are loaded as well.
 */
import { join } from "node:path";
import { MongoClient, type AnyBulkWriteOperation, type Document } from "mongodb";
import { DEFAULT_DOMAIN_CONFIG, ESTIMATE_FIELDS, estimateId, type EstimateRecord } from "@seg/domain";
import {
  COLLECTIONS,
  INDEXES,
  indexOptions,
  accountFromRow,
  computeTitleTotals,
  factFromRow,
  newTitleDoc,
  titleFromBookRow,
  type AccountDoc,
  type EstimateDoc,
  type EstimateEventDoc,
  type TitleAccountFactDoc,
  type TitleDoc,
  type UserDoc,
} from "@seg/data";
import { hashPassword } from "@seg/data/password";
import type { SeedPlan, SeedUser } from "./build";
import { APP_DIR, DERIVED_DIR, SOURCE_DIR, loadEnv, readJson, readNdjson } from "./files";

loadEnv();
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB ?? "seg";
const demoPassword = process.env.DEMO_PASSWORD ?? "SegDemo!2026";
if (!uri) throw new Error("Set MONGODB_URI (in .env.local or the environment).");

const started = Date.now();
const now = new Date().toISOString();

const books = readNdjson(join(SOURCE_DIR, "BIL_BOOKATTRIBUTES.ndjson"));
const stats = new Map(readNdjson(join(DERIVED_DIR, "SEG_TITLE_STATS.ndjson")).map((s) => [String(s.ISBN), s]));
const facts: TitleAccountFactDoc[] = readNdjson(join(DERIVED_DIR, "SEG_TITLE_ACCOUNT_FACTS.ndjson")).map(factFromRow);
const accounts = readNdjson(join(DERIVED_DIR, "ACCOUNTS.ndjson"))
  .map(accountFromRow)
  .filter((a): a is AccountDoc => a !== null);
const seedEstimates = readJson<EstimateRecord[]>(join(APP_DIR, "estimates.json"));
const plans = readJson<SeedPlan[]>(join(APP_DIR, "plans.json"));
const users = readJson<SeedUser[]>(join(APP_DIR, "users.json"));

// Estimates keyed by their stable id (later rows win, like successive edits).
const estimateMap = new Map<string, EstimateDoc>();
for (const e of seedEstimates) {
  const _id = estimateId(e.isbn, e.level, e);
  estimateMap.set(_id, { ...e, _id, updatedAt: e.updatedAt ?? now, updatedBy: e.updatedBy ?? "seed" });
}
const estimates = [...estimateMap.values()];

const factsByIsbn = new Map<string, TitleAccountFactDoc[]>();
for (const f of facts) {
  const list = factsByIsbn.get(f.isbn);
  if (list) list.push(f);
  else factsByIsbn.set(f.isbn, [f]);
}
const estimatesByIsbn = new Map<string, EstimateDoc[]>();
for (const e of estimates) estimatesByIsbn.set(e.isbn, [...(estimatesByIsbn.get(e.isbn) ?? []), e]);
const planByIsbn = new Map(plans.map((p) => [p.isbn, p]));

const titles: TitleDoc[] = books.map((b) => {
  const doc = newTitleDoc(titleFromBookRow(b, stats.get(String(b.EAN)), now, DEFAULT_DOMAIN_CONFIG));
  const plan = planByIsbn.get(doc.isbn);
  if (plan) doc.plan = { compIsbn: plan.compIsbn, titleNotes: plan.titleNotes, updatedAt: plan.updatedAt, updatedBy: plan.updatedBy };
  doc.totals = computeTitleTotals(
    factsByIsbn.get(doc.isbn) ?? [],
    doc.plan.compIsbn ? factsByIsbn.get(doc.plan.compIsbn) ?? [] : null,
    estimatesByIsbn.get(doc.isbn) ?? [],
    DEFAULT_DOMAIN_CONFIG,
  );
  return doc;
});

// History: one event per seeded value, already "synced" (the BigQuery loader writes the same events).
let eventSeq = 0;
const events: EstimateEventDoc[] = [];
for (const e of estimates) {
  for (const field of ESTIMATE_FIELDS) {
    const value = e[field];
    if (value === null || value === "") continue;
    events.push({
      _id: `seed-${String(eventSeq++).padStart(7, "0")}`,
      isbn: e.isbn,
      level: e.level,
      estimateId: e._id,
      channelId: e.channelId,
      channelName: e.channelName,
      orgId: e.orgId,
      orgName: e.orgName,
      accountId: e.accountId,
      accountName: e.accountName,
      field,
      oldValue: null,
      newValue: value,
      changedBy: e.updatedBy,
      changedAt: e.updatedAt,
      source: "migration",
      syncedAt: now,
    });
  }
}

const userDocs: UserDoc[] = await Promise.all(
  users.map(async (u) => ({
    _id: u.email.toLowerCase(),
    email: u.email.toLowerCase(),
    name: u.name,
    role: u.role,
    passwordHash: await hashPassword(demoPassword),
    active: true,
    createdAt: now,
  })),
);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

async function replace<T extends Document>(name: string, docs: T[]) {
  await db.collection(name).drop().catch(() => undefined);
  const col = db.collection<T>(name);
  for (let i = 0; i < docs.length; i += 5000) {
    await col.insertMany(docs.slice(i, i + 5000) as never[], { ordered: false });
  }
  for (const idx of INDEXES[name] ?? []) {
    await col.createIndex(idx.key, indexOptions(idx));
  }
  console.log(`  ${name.padEnd(22)} ${docs.length.toLocaleString()} docs`);
}

console.log(`Loading into ${dbName}…`);
await replace(COLLECTIONS.titles, titles);
await replace(COLLECTIONS.titleAccountFacts, facts);
await replace(COLLECTIONS.accounts, accounts);
await replace(COLLECTIONS.estimates, estimates);
await replace(COLLECTIONS.estimateEvents, events);

// Users are upserted so demo passwords can be reset without losing other users.
const userOps: AnyBulkWriteOperation<UserDoc>[] = userDocs.map((u) => ({
  replaceOne: { filter: { _id: u._id }, replacement: u, upsert: true },
}));
await db.collection<UserDoc>(COLLECTIONS.users).bulkWrite(userOps);
console.log(`  ${COLLECTIONS.users.padEnd(22)} ${userDocs.length} demo users (password from DEMO_PASSWORD)`);

// Collaboration data refers to the old titles: start empty, with indexes in place.
for (const name of [COLLECTIONS.comments, COLLECTIONS.notifications, COLLECTIONS.presence, COLLECTIONS.titleVisits, COLLECTIONS.trends, COLLECTIONS.chatRooms, COLLECTIONS.chatMessages, COLLECTIONS.chatReads]) {
  await db.collection(name).drop().catch(() => undefined);
  for (const idx of INDEXES[name] ?? []) await db.collection(name).createIndex(idx.key, indexOptions(idx));
}

await db.collection(COLLECTIONS.jobRuns).insertOne({
  _id: `seed-${now}` as never,
  job: "seed",
  startedAt: new Date(started).toISOString(),
  finishedAt: new Date().toISOString(),
  ok: true,
  detail: { titles: titles.length, facts: facts.length, estimates: estimates.length },
});

await client.close();
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
