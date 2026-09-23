import { MongoClient, type Collection, type Db, type Document } from "mongodb";
import {
  COLLECTIONS,
  type AccountDoc,
  type EstimateDoc,
  type EstimateEventDoc,
  type JobRunDoc,
  type TitleAccountFactDoc,
  type TitleDoc,
  type UserDoc,
} from "@seg/data";
import { env } from "./env";

/**
 * One MongoClient per server process (reused across requests and hot reloads).
 * Serverless functions keep it warm between invocations.
 */
const globalForMongo = globalThis as unknown as { __segMongo?: Promise<MongoClient> };

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
  return (await client()).db(env().MONGODB_DB);
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
};
