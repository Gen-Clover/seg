import { randomUUID } from "node:crypto";
import type { AnyBulkWriteOperation } from "mongodb";
import { z } from "zod";
import type { EstimateDoc, EstimateEventDoc } from "@seg/data";
import {
  EMPTY_ESTIMATE,
  estimateId,
  normalizeAccount,
  parseEstimateInput,
  refForLevel,
  type AccountRef,
  type EstimateField,
  type Level,
  type TitleTotals,
} from "@seg/domain";
import { collections } from "../db";
import { HttpError } from "../http";
import { refreshTitleTotals } from "./totals";
import { scheduleWriteback } from "./writeback";

const refSchema = z.object({
  channelId: z.string().nullable(),
  channelName: z.string().nullable(),
  orgId: z.string().nullable(),
  orgName: z.string().nullable(),
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
});

export const estimateChangeSchema = z.object({
  level: z.enum(["channel", "org", "account"]),
  ref: refSchema,
  field: z.enum(["laydownGoal", "laydownEstimate", "sixMonthEstimate", "salesNotes"]),
  value: z.union([z.number(), z.string(), z.null()]),
});
export const estimateChangesSchema = z.object({ changes: z.array(estimateChangeSchema).min(1).max(5000) });
export type EstimateChangeInput = z.infer<typeof estimateChangeSchema>;

export interface ApplyResult {
  estimates: EstimateDoc[];
  totals: TitleTotals;
  changed: number;
}

interface NormalizedChange {
  id: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  value: number | string | null;
}

function normalizeChange(isbn: string, c: EstimateChangeInput): NormalizedChange {
  const ref = refForLevel(c.level, normalizeAccount(c.ref));
  if (c.level === "org" && ref.orgId === null && ref.orgName === null) {
    throw new HttpError(400, "An organization row needs an organization.");
  }
  if (c.level === "account" && ref.accountId === null) throw new HttpError(400, "An account row needs an account number.");
  let value: number | string | null;
  if (c.field === "salesNotes") {
    value = c.value === null ? "" : String(c.value).trim().slice(0, 2000);
  } else {
    const parsed = parseEstimateInput(c.value);
    if (parsed === undefined) throw new HttpError(400, `"${String(c.value)}" is not a whole number.`);
    value = parsed;
  }
  return { id: estimateId(isbn, c.level, ref), level: c.level, ref, field: c.field, value };
}

/**
 * Applies cell edits for one title.
 * - Field-level upserts: concurrent edits to different cells never overwrite each other.
 * - Every real change is appended to the history log (which is also the BigQuery outbox).
 * - Title totals are recomputed with the shared roll-up rules.
 */
export async function applyEstimateChanges(
  isbn: string,
  input: EstimateChangeInput[],
  user: string,
  source: EstimateEventDoc["source"] = "grid",
): Promise<ApplyResult> {
  const titles = await collections.titles();
  const title = await titles.findOne({ _id: isbn }, { projection: { _id: 1, "plan.compIsbn": 1 } });
  if (!title) throw new HttpError(404, `Title ${isbn} was not found.`);

  const changes = input.map((c) => normalizeChange(isbn, c));
  // Last change per cell wins within one request.
  const byCell = new Map<string, NormalizedChange>();
  for (const c of changes) byCell.set(`${c.id}|${c.field}`, c);

  const estimates = await collections.estimates();
  const ids = [...new Set([...byCell.values()].map((c) => c.id))];
  const existing = new Map((await estimates.find({ _id: { $in: ids } }).toArray()).map((d) => [d._id, d]));

  const now = new Date().toISOString();
  const ops: AnyBulkWriteOperation<EstimateDoc>[] = [];
  const events: EstimateEventDoc[] = [];

  for (const c of byCell.values()) {
    const before = existing.get(c.id);
    const oldValue = before ? (before[c.field] ?? (c.field === "salesNotes" ? "" : null)) : c.field === "salesNotes" ? "" : null;
    if (oldValue === c.value) continue;

    const defaults: Record<string, unknown> = { ...EMPTY_ESTIMATE };
    delete defaults[c.field];
    ops.push({
      updateOne: {
        filter: { _id: c.id },
        update: {
          $set: { [c.field]: c.value, updatedAt: now, updatedBy: user },
          $setOnInsert: { isbn, level: c.level, ...c.ref, ...defaults },
        },
        upsert: true,
      },
    });
    events.push({
      _id: randomUUID(),
      isbn,
      level: c.level,
      estimateId: c.id,
      ...c.ref,
      field: c.field,
      oldValue,
      newValue: c.value,
      changedBy: user,
      changedAt: now,
      source,
      syncedAt: null,
    });
  }

  if (ops.length) {
    await estimates.bulkWrite(ops, { ordered: false });
    await (await collections.events()).insertMany(events);
    await titles.updateOne({ _id: isbn }, { $set: { "plan.updatedAt": now, "plan.updatedBy": user } });
    scheduleWriteback();
  }

  const [totals, updated] = await Promise.all([
    ops.length ? refreshTitleTotals(isbn, title.plan?.compIsbn ?? null) : titles.findOne({ _id: isbn }, { projection: { totals: 1 } }).then((t) => t!.totals),
    estimates.find({ _id: { $in: ids } }).toArray(),
  ]);
  return { estimates: updated, totals, changed: ops.length };
}

export const planChangeSchema = z
  .object({
    compIsbn: z.string().trim().min(1).nullable().optional(),
    titleNotes: z.string().max(4000).optional(),
  })
  .refine((v) => v.compIsbn !== undefined || v.titleNotes !== undefined, "Nothing to change.");

/** Updates title-level fields (comparable title, title notes). */
export async function applyPlanChange(isbn: string, change: z.infer<typeof planChangeSchema>, user: string) {
  const titles = await collections.titles();
  const title = await titles.findOne({ _id: isbn }, { projection: { plan: 1 } });
  if (!title) throw new HttpError(404, `Title ${isbn} was not found.`);
  if (change.compIsbn) {
    if (change.compIsbn === isbn) throw new HttpError(400, "A title cannot be its own comparable title.");
    const exists = await titles.countDocuments({ _id: change.compIsbn }, { limit: 1 });
    if (!exists) throw new HttpError(400, `Comparable title ${change.compIsbn} was not found.`);
  }

  const now = new Date().toISOString();
  const set: Record<string, unknown> = { "plan.updatedAt": now, "plan.updatedBy": user };
  const events: EstimateEventDoc[] = [];
  const blankRef = { channelId: null, channelName: null, orgId: null, orgName: null, accountId: null, accountName: null };
  const record = (field: "compIsbn" | "titleNotes", oldValue: string | null, newValue: string | null) => {
    if (oldValue === newValue) return;
    set[`plan.${field}`] = newValue;
    events.push({
      _id: randomUUID(), isbn, level: "title", estimateId: `${isbn}|title`, ...blankRef,
      field, oldValue, newValue, changedBy: user, changedAt: now, source: "grid", syncedAt: null,
    });
  };
  if (change.compIsbn !== undefined) record("compIsbn", title.plan?.compIsbn ?? null, change.compIsbn);
  if (change.titleNotes !== undefined) record("titleNotes", title.plan?.titleNotes ?? "", change.titleNotes.trim());

  if (events.length) {
    await titles.updateOne({ _id: isbn }, { $set: set });
    await (await collections.events()).insertMany(events);
    scheduleWriteback();
  }
  return { changed: events.length };
}
