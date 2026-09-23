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
  comments: "comments",
  chatRooms: "chat_rooms",
  chatMessages: "chat_messages",
  // Operational (not written to BigQuery; safe to lose on a rebuild)
  users: "users",
  jobRuns: "job_runs",
  notifications: "notifications",
  presence: "presence",
  titleVisits: "title_visits",
  chatReads: "chat_reads",
  // Derived (recomputed from estimates and history)
  trends: "trends",
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

/**
 * A comment on a title or one of its rows. Also the outbox for BigQuery: syncedAt is reset
 * to null on every change so the new version is appended to SEG_COMMENTS.
 */
export interface CommentDoc extends AccountRef {
  _id: string;
  isbn: string;
  /** estimateId() of the row, or "<isbn>|title" for the title-level conversation. */
  threadKey: string;
  level: Level | "title";
  body: string;
  /** E-mails of mentioned users. */
  mentions: string[];
  authorEmail: string;
  authorName: string;
  createdAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
}

export interface NotificationDoc {
  _id: string;
  /** Recipient. */
  email: string;
  /** mention / reply: title comments; chat_mention: a chat message. */
  type: "mention" | "reply" | "chat_mention";
  /** Comment or chat message id. */
  commentId: string;
  /** Title comments: the title and thread. Empty for chat. */
  isbn: string;
  threadKey: string;
  /** Chat: the room to open. */
  roomId?: string;
  /** Title name, or the chat room's name. */
  titleName: string;
  rowLabel: string;
  fromEmail: string;
  fromName: string;
  excerpt: string;
  createdAt: string;
  readAt: string | null;
}

/**
 * A chat room: "everyone" (the whole team), a named group, or a direct conversation.
 * Also the outbox for SEG_CHAT_ROOMS (syncedAt reset on every change).
 */
export interface ChatRoomDoc {
  _id: string; // "everyone", "grp:<uuid>" or "dm:<email>|<email>"
  type: "everyone" | "group" | "direct";
  name: string;
  /** E-mails; empty for "everyone" (all active users). */
  members: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessage: { authorName: string; excerpt: string } | null;
  syncedAt: string | null;
}

/** A chat message. Also the outbox for SEG_CHAT_MESSAGES (append-only versions). */
export interface ChatMessageDoc {
  _id: string;
  roomId: string;
  authorEmail: string;
  authorName: string;
  body: string;
  mentions: string[];
  /** Catalog titles referenced by ISBN in the message (shown as links). */
  titleRefs: { isbn: string; title: string }[];
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  syncedAt: string | null;
}

/** When a person last read a room (for unread counts). */
export interface ChatReadDoc {
  _id: string; // "<roomId>|<email>"
  roomId: string;
  email: string;
  readAt: string;
}

/** Who is looking at a title right now (heartbeat; expires automatically). */
export interface PresenceDoc {
  _id: string; // "<isbn>|<email>"
  isbn: string;
  email: string;
  name: string;
  /** Cell being edited: "<estimateId>|<field>", or null. */
  cell: string | null;
  seenAt: Date;
}

/** When a user last had a title open (for "changed since your last visit"). */
export interface TitleVisitDoc {
  _id: string; // "<email>|<isbn>"
  email: string;
  isbn: string;
  visitedAt: string;
}

/** Weekly totals per title for the season dashboard. One document, recomputed nightly. */
export interface TrendsDoc {
  _id: "weekly";
  /** Week boundaries (ISO timestamps, oldest first); the last one is the computation time. */
  points: string[];
  /** Per ISBN: laydown goal, laydown estimate and 6-month estimate at each point. */
  series: Record<string, [(number | null)[], (number | null)[], (number | null)[]]>;
  computedAt: string;
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

type IndexSpec = { key: Record<string, 1 | -1 | "text">; name: string; unique?: boolean; expireAfterSeconds?: number };

/** Options for createIndex() from a spec. */
export const indexOptions = (idx: IndexSpec) => ({
  name: idx.name,
  ...(idx.unique ? { unique: true } : {}),
  ...(idx.expireAfterSeconds !== undefined ? { expireAfterSeconds: idx.expireAfterSeconds } : {}),
});

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
    { key: { changedAt: -1 }, name: "recent" },
  ],
  [COLLECTIONS.comments]: [
    { key: { isbn: 1, createdAt: 1 }, name: "title" },
    { key: { syncedAt: 1 }, name: "outbox" },
  ],
  [COLLECTIONS.chatRooms]: [
    { key: { members: 1, lastMessageAt: -1 }, name: "member" },
    { key: { syncedAt: 1 }, name: "outbox" },
  ],
  [COLLECTIONS.chatMessages]: [
    { key: { roomId: 1, createdAt: -1 }, name: "room" },
    { key: { syncedAt: 1 }, name: "outbox" },
  ],
  [COLLECTIONS.chatReads]: [{ key: { email: 1 }, name: "email" }],
  [COLLECTIONS.notifications]: [
    { key: { email: 1, createdAt: -1 }, name: "inbox" },
    { key: { email: 1, readAt: 1 }, name: "unread" },
  ],
  [COLLECTIONS.presence]: [
    { key: { isbn: 1, seenAt: -1 }, name: "title" },
    { key: { seenAt: 1 }, name: "expire", expireAfterSeconds: 60 },
  ],
};
