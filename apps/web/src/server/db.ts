import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import {
  COLLECTIONS,
  INDEXES,
  indexOptions,
  type AccountDoc,
  type CommentDoc,
  type EstimateDoc,
  type EstimateEventDoc,
  type JobRunDoc,
  type NotificationDoc,
  type PresenceDoc,
  type TitleAccountFactDoc,
  type TitleDoc,
  type TitleVisitDoc,
  type TrendsDoc,
  type UserDoc,
} from "@seg/data";
import { env } from "./env";

/**
 * One MongoClient per server process (reused across requests and hot reloads).
 * Serverless functions keep it warm between invocations.
 */
const globalForMongo = globalThis as unknown as { __segMongo?: Promise<MongoClient>; __segIndexes?: Promise<void> };

function client(): Promise<MongoClient> {
  if (!globalForMongo.__segMongo) {
    const c = new MongoClient(env().MONGODB_URI, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 60_000,
      serverSelectionTimeoutMS: 8_000,
      appName: "seg-web",
    });
    globalForMongo.__segMongo = c.connect().catch((err) => {
      globalForMongo.__segMongo = undefined;
      throw err;
    });
  }
  return globalForMongo.__segMongo;
}

export async function db(): Promise<Db> {
  const database = (await client()).db(env().MONGODB_DB);
  // Once per process: make sure every index exists (idempotent and quick; new collections need no job run).
  globalForMongo.__segIndexes ??= ensureIndexes(database).catch((err) => {
    globalForMongo.__segIndexes = undefined;
    console.error("[db] index check failed", err);
  });
  return database;
}

async function ensureIndexes(database: Db) {
  await Promise.all(
    Object.entries(INDEXES).flatMap(([name, specs]) => specs.map((idx) => database.collection(name).createIndex(idx.key, indexOptions(idx)))),
  );
}

async function col<T extends Document>(name: string): Promise<Collection<T>> {
  return (await db()).collection<T>(name);
}

export const collections = {
  titles: () => col<TitleDoc>(COLLECTIONS.titles),
  facts: () => col<TitleAccountFactDoc>(COLLECTIONS.titleAccountFacts),
  accounts: () => col<AccountDoc>(COLLECTIONS.accounts),
  estimates: () => col<EstimateDoc>(COLLECTIONS.estimates),
  events: () => col<EstimateEventDoc>(COLLECTIONS.estimateEvents),
  users: () => col<UserDoc>(COLLECTIONS.users),
  jobRuns: () => col<JobRunDoc>(COLLECTIONS.jobRuns),
  comments: () => col<CommentDoc>(COLLECTIONS.comments),
  notifications: () => col<NotificationDoc>(COLLECTIONS.notifications),
  presence: () => col<PresenceDoc>(COLLECTIONS.presence),
  visits: () => col<TitleVisitDoc>(COLLECTIONS.titleVisits),
  trends: () => col<TrendsDoc>(COLLECTIONS.trends),
};
