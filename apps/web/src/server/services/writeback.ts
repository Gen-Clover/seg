import { after } from "next/server";
import { ESTIMATE_EVENTS_TABLE } from "@seg/data";
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
export async function flushWriteback(limit = 1000): Promise<{ sent: number; pending: number }> {
  const events = await collections.events();
  if (env().WRITEBACK === "none") {
    return { sent: 0, pending: await events.countDocuments({ syncedAt: null }) };
  }

  const batch = await events.find({ syncedAt: null }).sort({ changedAt: 1 }).limit(limit).toArray();
  if (!batch.length) return { sent: 0, pending: 0 };

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
  return { sent: batch.length, pending };
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
