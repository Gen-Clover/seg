/**
 * MongoDB is a fast, disposable working store. Reference collections are rebuilt from
 * BigQuery by the ingestion job; app collections hold user edits until they are written
 * to BigQuery (and are then also recoverable from BigQuery).
 */
import type { AccountRef, EstimateValues, Level, TitleTotals } from "@seg/domain";

export const COLLECTIONS = {
  // Reference data (owned by BigQuery, loaded by ingestion)
  titles: "titles",
  titleAccountFacts: "title_account_facts",
  accounts: "accounts",
  // App data (owned by users, written back to BigQuery)
  estimates: "estimates",
  estimateEvents: "estimate_events",
  // Operational
  users: "users",
  jobRuns: "job_runs",
} as const;

/** One catalog title. Reference fields come from BigQuery; `plan` and `totals` are app-owned. */
export interface TitleDoc {
  _id: string; // ISBN (EAN)
  isbn: string;
  title: string;
  author: string | null;
  season: string | null;
  seasonSort: number;
  division: string | null;
  imprint: string | null;
  format: string | null;
  ipmFormat: string | null;
  usPrice: number | null;
  pubDate: string | null; // YYYY-MM-DD
  releaseDate: string | null;
  paperCutOff: string | null;
  ldc: string | null;
  pages: number | null;
  trim: string | null;
  printRun: number | null;
  announcedPrinting: number | null;
  competitiveTitles: string[];
  ebookIsbn: string | null;
  /** Shown on the summary page (legacy scope rules). Out-of-scope titles can still be comparable titles. */
  inScope: boolean;
  stats: {
    ltdGrossUnits: number | null;
    bookscanLtd: number | null;
    ebookUnits: number | null;
  };
  plan: {
    compIsbn: string | null;
    titleNotes: string;
    updatedAt: string | null;
    updatedBy: string | null;
  };
  totals: TitleTotals;
  /** Lower-cased "isbn title author" for quick search. */
  search: string;
  refreshedAt: string;
}

/** Per title and account figures, precomputed from BigQuery. */
export interface TitleAccountFactDoc extends AccountRef {
  isbn: string;
  initialOrder: number;
  grossUnits: number;
  netUnits: number;
  readerlinkPos: number;
  /** Row belongs to this title's own grid (pre-pub activity, popular-account or ReaderLink placeholder). */
  inTitleList: boolean;
  /** Row is shown when this title is used as a comparable title (any activity). */
  inCompList: boolean;
}

/** A valid channel / organization / account combination (for adding rows and validating uploads). */
export interface AccountDoc extends AccountRef {
  _id: string; // accountKey()
  search: string;
}

/** App-owned estimate for one level of one title. _id = estimateId(). */
export interface EstimateDoc extends AccountRef, EstimateValues {
  _id: string;
  isbn: string;
  level: Level;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Append-only change log. Doubles as the audit history and the outbox for BigQuery:
 * `syncedAt` stays null until the event is written to BigQuery.
 */
export interface EstimateEventDoc extends AccountRef {
  _id: string;
  isbn: string;
  /** "title" for title-level fields (comparable title, title notes). */
  level: Level | "title";
  estimateId: string;
  /** Estimate field, or "compIsbn" / "titleNotes" for title-level changes. */
  field: string;
  oldValue: string | number | null;
  newValue: string | number | null;
  changedBy: string;
  changedAt: string;
  source: "grid" | "upload" | "migration";
  syncedAt: string | null;
}

export type Role = "admin" | "editor" | "viewer";

export interface UserDoc {
  _id: string; // lower-cased email
  email: string;
  name: string;
  role: Role;
  /** Demo credentials only; production signs in with Microsoft Entra ID. */
  passwordHash: string | null;
  active: boolean;
  createdAt: string;
}

export interface JobRunDoc {
  _id: string;
  job: "ingest" | "writeback" | "seed";
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  detail: Record<string, unknown>;
}

type IndexSpec = { key: Record<string, 1 | -1 | "text">; name: string; unique?: boolean };

export const INDEXES: Record<string, IndexSpec[]> = {
  [COLLECTIONS.titles]: [
    { key: { inScope: 1, seasonSort: 1 }, name: "scope_season" },
    { key: { search: 1 }, name: "search" },
  ],
  [COLLECTIONS.titleAccountFacts]: [
    { key: { isbn: 1, channelId: 1, orgId: 1, accountId: 1 }, name: "isbn_account" },
  ],
  [COLLECTIONS.accounts]: [
    { key: { channelId: 1, orgId: 1, accountId: 1 }, name: "combination" },
    { key: { search: 1 }, name: "search" },
  ],
  [COLLECTIONS.estimates]: [{ key: { isbn: 1 }, name: "isbn" }],
  [COLLECTIONS.estimateEvents]: [
    { key: { syncedAt: 1, changedAt: 1 }, name: "outbox" },
    { key: { isbn: 1, changedAt: -1 }, name: "history" },
  ],
};
