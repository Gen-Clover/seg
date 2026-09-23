import { after } from "next/server";
import type { Collection, Filter, UpdateFilter } from "mongodb";
import {
  CHAT_MESSAGES_SCHEMA,
  CHAT_MESSAGES_TABLE,
  CHAT_ROOMS_SCHEMA,
  CHAT_ROOMS_TABLE,
  COMMENTS_SCHEMA,
  COMMENTS_TABLE,
  ESTIMATE_EVENTS_TABLE,
  tableSchema,
  type BqField,
  type ChatMessageDoc,
  type ChatRoomDoc,
  type CommentDoc,
} from "@seg/data";
import { bigquery, bigQueryConfig } from "../bigquery";
import { collections } from "../db";
import { env } from "../env";

/**
 * Write-back of user edits to BigQuery (the source of truth).
 *
 * Every edit is first stored in MongoDB as an event with syncedAt = null (the outbox).
 * flushWriteback() appends pending events to BigQuery and marks them synced. It runs right
 * after each save (in the background, after the response is sent) and on a schedule as a
 * safety net, so nothing is lost if BigQuery is briefly unavailable.
 *
 * WRITEBACK=none (demo without BigQuery) keeps events in MongoDB only.
 */
export async function flushWriteback(limit = 1000): Promise<{ sent: number; pending: number; comments: number; chat: number }> {
  const events = await collections.events();
  if (env().WRITEBACK === "none") {
    return { sent: 0, pending: await events.countDocuments({ syncedAt: null }), comments: 0, chat: 0 };
  }
  // A comments/chat problem must never hold up estimate edits (they are retried on the next run).
  const comments = await flushComments(limit).catch((err) => {
    console.error("[writeback] comments flush failed", err);
    return 0;
  });
  const chat = await flushChat(limit).catch((err) => {
    console.error("[writeback] chat flush failed", err);
    return 0;
  });

  const batch = await events.find({ syncedAt: null }).sort({ changedAt: 1 }).limit(limit).toArray();
  if (!batch.length) return { sent: 0, pending: 0, comments, chat };

  const cfg = bigQueryConfig();
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const rows = batch.map((e) => ({
    insertId: e._id, // BigQuery de-duplicates retries by insertId
    json: {
      event_id: e._id,
      isbn: e.isbn,
      level: e.level,
      distribution_channel: e.channelId,
      distribution_channel_name: e.channelName,
      organization_id: e.orgId,
      organization_name: e.orgName,
      account_number: e.accountId,
      account_name: e.accountName,
      field: e.field,
      old_value: str(e.oldValue),
      new_value: str(e.newValue),
      changed_by: e.changedBy,
      changed_at: e.changedAt,
      source: e.source,
    },
  }));

  await bigquery().dataset(cfg.appDataset).table(ESTIMATE_EVENTS_TABLE).insert(rows, { raw: true });
  const syncedAt = new Date().toISOString();
  await events.updateMany({ _id: { $in: batch.map((e) => e._id) } }, { $set: { syncedAt } });
  const pending = await events.countDocuments({ syncedAt: null });
  return { sent: batch.length, pending, comments, chat };
}

const globalForBq = globalThis as unknown as { __segTables?: Map<string, Promise<void>> };

/** Creates an app table on first use (once per process), so no manual BigQuery setup is needed. */
function ensureTable(table: string, schema: BqField[], partitionField: string, cluster: string): Promise<void> {
  globalForBq.__segTables ??= new Map();
  let ready = globalForBq.__segTables.get(table);
  if (!ready) {
    ready = (async () => {
      const dataset = bigquery().dataset(bigQueryConfig().appDataset);
      const [exists] = await dataset.table(table).exists();
      if (exists) return;
      await dataset
        .createTable(table, {
          schema: tableSchema(schema),
          timePartitioning: { type: "DAY", field: partitionField },
          clustering: { fields: [cluster] },
        })
        .catch((err: { code?: number }) => {
          if (err.code !== 409) throw err; // created concurrently
        });
    })().catch((err) => {
      globalForBq.__segTables?.delete(table);
      throw err;
    });
    globalForBq.__segTables.set(table, ready);
  }
  return ready;
}

/**
 * Appends the current version of every changed document (syncedAt = null) to an append-only
 * BigQuery table, then marks those versions synced. Used for comments and team chat.
 */
async function flushVersioned<T extends { _id: string; syncedAt: string | null }>(opts: {
  collection: Collection<T>;
  table: string;
  schema: BqField[];
  partitionField: string;
  cluster: string;
  limit: number;
  /** Timestamp identifying this version. */
  versionOf: (doc: T) => string;
  row: (doc: T, versionAt: string) => Record<string, unknown>;
  /** Matches the document only while it is still the version that was sent. */
  unchanged: (doc: T) => Record<string, unknown>;
}): Promise<number> {
  const batch = (await opts.collection.find({ syncedAt: null } as Filter<T>).limit(opts.limit).toArray()) as T[];
  if (!batch.length) return 0;
  await ensureTable(opts.table, opts.schema, opts.partitionField, opts.cluster);
  const rows = batch.map((doc) => {
    const versionAt = opts.versionOf(doc);
    return { insertId: `${doc._id}:${versionAt}`, json: opts.row(doc, versionAt) };
  });
  await bigquery().dataset(bigQueryConfig().appDataset).table(opts.table).insert(rows, { raw: true });
  const syncedAt = new Date().toISOString();
  // Only mark versions that did not change again while sending.
  await opts.collection.bulkWrite(
    batch.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id, syncedAt: null, ...opts.unchanged(doc) } as Filter<T>,
        update: { $set: { syncedAt } } as UpdateFilter<T>,
      },
    })),
    { ordered: false },
  );
  // A document edited during the send no longer matches, stays unsynced, and its new version goes next time.
  return batch.length;
}

const latest = (...ts: (string | null)[]) => ts.filter((t): t is string => !!t).sort().at(-1)!;

async function flushComments(limit: number): Promise<number> {
  return flushVersioned<CommentDoc>({
    collection: await collections.comments(),
    table: COMMENTS_TABLE,
    schema: COMMENTS_SCHEMA,
    partitionField: "created_at",
    cluster: "isbn",
    limit,
    versionOf: (c) => latest(c.createdAt, c.deletedAt),
    unchanged: (c) => ({ deletedAt: c.deletedAt }),
    row: (c, versionAt) => ({
      comment_id: c._id,
      version_at: versionAt,
      isbn: c.isbn,
      thread_key: c.threadKey,
      level: c.level,
      distribution_channel: c.channelId,
      distribution_channel_name: c.channelName,
      organization_id: c.orgId,
      organization_name: c.orgName,
      account_number: c.accountId,
      account_name: c.accountName,
      body: c.body,
      mentions: c.mentions.join(","),
      author_email: c.authorEmail,
      author_name: c.authorName,
      created_at: c.createdAt,
      deleted_at: c.deletedAt,
    }),
  });
}

async function flushChat(limit: number): Promise<number> {
  const rooms = await flushVersioned<ChatRoomDoc>({
    collection: await collections.chatRooms(),
    table: CHAT_ROOMS_TABLE,
    schema: CHAT_ROOMS_SCHEMA,
    partitionField: "created_at",
    cluster: "room_id",
    limit,
    versionOf: (r) => r.updatedAt,
    unchanged: (r) => ({ updatedAt: r.updatedAt }),
    row: (r, versionAt) => ({
      room_id: r._id,
      version_at: versionAt,
      type: r.type,
      name: r.name,
      members: r.members.join(","),
      created_by: r.createdBy,
      created_at: r.createdAt,
    }),
  });
  const messages = await flushVersioned<ChatMessageDoc>({
    collection: await collections.chatMessages(),
    table: CHAT_MESSAGES_TABLE,
    schema: CHAT_MESSAGES_SCHEMA,
    partitionField: "created_at",
    cluster: "room_id",
    limit,
    versionOf: (m) => latest(m.createdAt, m.editedAt, m.deletedAt),
    unchanged: (m) => ({ editedAt: m.editedAt, deletedAt: m.deletedAt }),
    row: (m, versionAt) => ({
      message_id: m._id,
      version_at: versionAt,
      room_id: m.roomId,
      author_email: m.authorEmail,
      author_name: m.authorName,
      body: m.body,
      mentions: m.mentions.join(","),
      title_refs: JSON.stringify(m.titleRefs),
      created_at: m.createdAt,
      edited_at: m.editedAt,
      deleted_at: m.deletedAt,
    }),
  });
  return rooms + messages;
}

/** Runs a flush after the current response has been sent. */
export function scheduleWriteback() {
  if (env().WRITEBACK === "none") return;
  after(async () => {
    try {
      await flushWriteback();
    } catch (err) {
      // The scheduled job retries; the edit is safe in MongoDB.
      console.error("[writeback] flush failed", err);
    }
  });
}
