import { z } from "zod";
import { loadRootEnv } from "./load-env";

/**
 * Server configuration. Everything that differs between the demo (Vercel) and the client's
 * production servers is here — see docs/PRODUCTION_CUTOVER.md.
 */
const schema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().default("seg"),

  AUTH_PROVIDER: z.enum(["credentials", "entra"]).default("credentials"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  SESSION_HOURS: z.coerce.number().positive().default(12),
  /** Demo only: shown on the sign-in page for the seeded demo users. */
  DEMO_PASSWORD: z.string().optional(),

  WRITEBACK: z.enum(["none", "bigquery"]).default("none"),
  GCP_PROJECT_ID: z.string().optional(),
  GCP_KEY_BASE64: z.string().optional(),
  BQ_SOURCE_DATASET: z.string().default("seg_source"),
  BQ_APP_DATASET: z.string().default("seg_app"),
  BQ_LOCATION: z.string().default("US"),

  CRON_SECRET: z.string().optional(),
  MAIN_MENU_URL: z.string().optional(),

  ACCOUNT_LEVEL_CHANNELS: z.string().optional(),
  MIN_SEASON_YEAR: z.coerce.number().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  loadRootEnv();
  // The Vercel MongoDB Atlas integration names its variable `<PREFIX>_URL`.
  const parsed = schema.safeParse({ ...process.env, MONGODB_URI: process.env.MONGODB_URI || process.env.MONGODB_URL });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
