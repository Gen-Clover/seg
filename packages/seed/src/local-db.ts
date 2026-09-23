/**
 * Runs a real MongoDB server on this machine for development (no Atlas needed).
 * Data is kept in packages/seed/output/local-mongo between runs.
 *
 *   npm run db:local        → mongodb://127.0.0.1:27018/seg
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import { OUTPUT_DIR } from "./files";

const port = Number(process.env.LOCAL_MONGO_PORT ?? 27018);
const dbPath = join(OUTPUT_DIR, "local-mongo");
mkdirSync(dbPath, { recursive: true });

const server = await MongoMemoryServer.create({
  instance: { port, dbPath, storageEngine: "wiredTiger", ip: "127.0.0.1" },
});
console.log(`Local MongoDB running: ${server.getUri()}seg  (data: ${dbPath})`);
console.log("Press Ctrl+C to stop.");

const stop = async () => {
  await server.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
