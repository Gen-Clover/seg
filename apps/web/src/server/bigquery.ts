import { BigQuery } from "@google-cloud/bigquery";
import type { BigQueryConfig } from "@seg/data";
import { DEFAULT_DOMAIN_CONFIG } from "@seg/domain";
import { env } from "./env";
import { HttpError } from "./http";

const globalForBq = globalThis as unknown as { __segBq?: BigQuery };

/**
 * BigQuery client. Credentials come from GCP_KEY_BASE64 (Vercel) or
 * GOOGLE_APPLICATION_CREDENTIALS (a key file path, local / client servers).
 */
export function bigquery(): BigQuery {
  if (globalForBq.__segBq) return globalForBq.__segBq;
  const e = env();
  if (!e.GCP_PROJECT_ID) throw new HttpError(500, "GCP_PROJECT_ID is not configured.");
  const credentials = e.GCP_KEY_BASE64
    ? JSON.parse(Buffer.from(e.GCP_KEY_BASE64, "base64").toString("utf8"))
    : undefined;
  globalForBq.__segBq = new BigQuery({ projectId: e.GCP_PROJECT_ID, location: e.BQ_LOCATION, ...(credentials ? { credentials } : {}) });
  return globalForBq.__segBq;
}

export function bigQueryConfig(): BigQueryConfig {
  const e = env();
  return {
    projectId: e.GCP_PROJECT_ID ?? "",
    sourceDataset: e.BQ_SOURCE_DATASET,
    appDataset: e.BQ_APP_DATASET,
    location: e.BQ_LOCATION,
    // The ingestion job passes the admin-set first season year; this is the configured default.
    minSeasonYear: env().MIN_SEASON_YEAR ?? DEFAULT_DOMAIN_CONFIG.minSeasonYear,
  };
}
