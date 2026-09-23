import { after } from "next/server";
import { COMMENTS_SCHEMA, COMMENTS_TABLE, ESTIMATE_EVENTS_TABLE, tableSchema } from "@seg/data";
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
export async function flushWriteback(limit = 1000): Promise<{ sent: number; pending: number; comments: number }> {
  const events = await collections.events();
  if (env().WRITEBACK === "none") {
    return { sent: 0, pending: await events.countDocuments({ syncedAt: null }), comments: 0 };
  }
  // A comments problem must never hold up estimate edits (they are retried on the next run).
  const comments = await flushComments(limit).catch((err) => {
    console.error("[writeback] comments flush failed", err);
    return 0;
  });

  const batch = await events.find({ syncedAt: null }).sort({ changedAt: 1 }).limit(limit).toArray();
  if (!batch.length) return { sent: 0, pending: 0, comments };

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
  return { sent: batch.length, pending, comments };
}

const globalForBq = globalThis as unknown as { __segCommentsTable?: Promise<void> };

/** Creates SEG_COMMENTS on first use (once per process), so no manual BigQuery setup is needed. */
function ensureCommentsTable(): Promise<void> {
  globalForBq.__segCommentsTable ??= (async () => {
    const table = bigquery().dataset(bigQueryConfig().appDataset).table(COMMENTS_TABLE);
    const [exists] = await table.exists();
    if (!exists) {
      await bigquery()
        .dataset(bigQueryConfig().appDataset)
        .createTable(COMMENTS_TABLE, {
          schema: tableSchema(COMMENTS_SCHEMA),
          timePartitioning: { type: "DAY", field: "created_at" },
          clustering: { fields: ["isbn"] },
        })
        .catch((err: { code?: number }) => {
          if (err.code !== 409) throw err; // created concurrently
        });
    }
  })().catch((err) => {
    globalForBq.__segCommentsTable = undefined;
    throw err;
  });
  return globalForBq.__segCommentsTable;
}

/** Appends new comment versions (posts and deletions) to SEG_COMMENTS. */
async function flushComments(limit: number): Promise<number> {
  const comments = await collections.comments();
  const batch = await comments.find({ syncedAt: null }).limit(limit).toArray();
  if (!batch.length) return 0;
  await ensureCommentsTable();
  const rows = batch.map((c) => {
    const versionAt = c.deletedAt ?? c.createdAt;
    return {
      insertId: `${c._id}:${versionAt}`,
      json: {
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
      },
    };
  });
  await bigquery().dataset(bigQueryConfig().appDataset).table(COMMENTS_TABLE).insert(rows, { raw: true });
  const syncedAt = new Date().toISOString();
  // Only mark versions that did not change again while sending.
  await comments.bulkWrite(
    batch.map((c) => ({ updateOne: { filter: { _id: c._id, deletedAt: c.deletedAt }, update: { $set: { syncedAt } } } })),
    { ordered: false },
  );
  return batch.length;
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
