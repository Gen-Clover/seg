import { randomUUID } from "node:crypto";
import { MongoBulkWriteError, type AnyBulkWriteOperation } from "mongodb";
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

const cellValueSchema = z.union([z.number(), z.string(), z.null()]);

export const estimateChangeSchema = z.object({
  level: z.enum(["channel", "org", "account"]),
  ref: refSchema,
  field: z.enum(["laydownGoal", "laydownEstimate", "sixMonthEstimate", "salesNotes"]),
  value: cellValueSchema,
  /**
   * The value the user saw before editing. When given, the change is saved only if the cell
   * still holds it; otherwise it comes back as a conflict. Omitted = overwrite.
   */
  expected: cellValueSchema.optional(),
});
export const estimateChangesSchema = z.object({ changes: z.array(estimateChangeSchema).min(1).max(5000) });
export type EstimateChangeInput = z.infer<typeof estimateChangeSchema>;

type CellValue = number | string | null;

/** A change that was not saved because someone else changed the cell first. */
export interface CellConflict {
  estimateId: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  yours: CellValue;
  current: CellValue;
  changedBy: string | null;
  changedAt: string | null;
}

export interface ApplyResult {
  estimates: EstimateDoc[];
  totals: TitleTotals;
  changed: number;
  conflicts: CellConflict[];
}

interface NormalizedChange {
  id: string;
  level: Level;
  ref: AccountRef;
  field: EstimateField;
  value: CellValue;
  /** undefined = no check (overwrite). */
  expected: CellValue | undefined;
}

const blank = (field: EstimateField): CellValue => (field === "salesNotes" ? "" : null);
const storedValue = (doc: EstimateDoc | undefined, field: EstimateField): CellValue => (doc ? (doc[field] ?? blank(field)) : blank(field));

/** Mongo filter matching a cell that holds `value` (a blank cell may also be missing). */
function holds(field: EstimateField, value: CellValue): Record<string, unknown> {
  if (value === null) return { [field]: null };
  if (value === "") return { [field]: { $in: ["", null] } };
  return { [field]: value };
}

function normalizeValue(field: EstimateField, raw: CellValue): CellValue {
  if (field === "salesNotes") return raw === null ? "" : String(raw).trim().slice(0, 2000);
  const parsed = parseEstimateInput(raw);
  if (parsed === undefined) throw new HttpError(400, `"${String(raw)}" is not a whole number.`);
  return parsed;
}

function normalizeChange(isbn: string, c: EstimateChangeInput): NormalizedChange {
  const ref = refForLevel(c.level, normalizeAccount(c.ref));
  if (c.level === "org" && ref.orgId === null && ref.orgName === null) {
    throw new HttpError(400, "An organization row needs an organization.");
  }
  if (c.level === "account" && ref.accountId === null) throw new HttpError(400, "An account row needs an account number.");
  return {
    id: estimateId(isbn, c.level, ref),
    level: c.level,
    ref,
    field: c.field,
    value: normalizeValue(c.field, c.value),
    expected: c.expected === undefined ? undefined : normalizeValue(c.field, c.expected),
  };
}

const isDuplicateKeyOnly = (err: unknown) =>
  err instanceof MongoBulkWriteError &&
  (Array.isArray(err.writeErrors) ? err.writeErrors : [err.writeErrors]).every((e) => e.code === 11000);

/**
 * Applies cell edits for one title.
 * - Field-level writes: concurrent edits to different cells never overwrite each other.
 * - Per-cell version check: a change carrying `expected` is written only if the cell still
 *   holds that value (checked inside the write itself, so two simultaneous saves cannot both win).
 *   Otherwise it is returned as a conflict with who changed the cell and when.
 * - Every applied change is appended to the history log (which is also the BigQuery outbox).
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

  // Last change per cell wins within one request.
  const byCell = new Map<string, NormalizedChange>();
  for (const c of input.map((x) => normalizeChange(isbn, x))) byCell.set(`${c.id}|${c.field}`, c);

  const estimates = await collections.estimates();
  const ids = [...new Set([...byCell.values()].map((c) => c.id))];
  const existing = new Map((await estimates.find({ _id: { $in: ids } }).toArray()).map((d) => [d._id, d]));

  const now = new Date().toISOString();
  const ops: AnyBulkWriteOperation<EstimateDoc>[] = [];
  const attempted: { change: NormalizedChange; oldValue: CellValue; guarded: boolean }[] = [];
  const conflicted: { change: NormalizedChange; current: CellValue }[] = [];

  for (const c of byCell.values()) {
    const before = existing.get(c.id);
    const oldValue = storedValue(before, c.field);
    if (oldValue === c.value) continue;
    if (c.expected !== undefined && c.expected !== oldValue) {
      conflicted.push({ change: c, current: oldValue });
      continue;
    }
    const guarded = c.expected !== undefined;
    const defaults: Record<string, unknown> = { ...EMPTY_ESTIMATE };
    delete defaults[c.field];
    ops.push({
      updateOne: {
        filter: guarded ? { _id: c.id, ...holds(c.field, oldValue) } : { _id: c.id },
        update: {
          $set: { [c.field]: c.value, updatedAt: now, updatedBy: user },
          $setOnInsert: { isbn, level: c.level, ...c.ref, ...defaults },
        },
        // A guarded write to an existing row must not insert a copy when the check fails.
        upsert: !guarded || !before,
      },
    });
    attempted.push({ change: c, oldValue, guarded });
  }

  if (ops.length) {
    try {
      await estimates.bulkWrite(ops, { ordered: false });
    } catch (err) {
      // A guarded insert raced with another insert of the same row: detected as a conflict below.
      if (!isDuplicateKeyOnly(err)) throw err;
    }
  }

  const after = new Map((await estimates.find({ _id: { $in: ids } }).toArray()).map((d) => [d._id, d]));
  const events: EstimateEventDoc[] = [];
  for (const a of attempted) {
    const current = storedValue(after.get(a.change.id), a.change.field);
    if (a.guarded && current !== a.change.value) {
      conflicted.push({ change: a.change, current });
      continue;
    }
    const c = a.change;
    events.push({
      _id: randomUUID(),
      isbn,
      level: c.level,
      estimateId: c.id,
      ...c.ref,
      field: c.field,
      oldValue: a.oldValue,
      newValue: c.value,
      changedBy: user,
      changedAt: now,
      source,
      syncedAt: null,
    });
  }

  if (events.length) {
    await (await collections.events()).insertMany(events);
    await titles.updateOne({ _id: isbn }, { $set: { "plan.updatedAt": now, "plan.updatedBy": user } });
    scheduleWriteback();
  }

  const [totals, conflicts] = await Promise.all([
    events.length
      ? refreshTitleTotals(isbn, title.plan?.compIsbn ?? null)
      : titles.findOne({ _id: isbn }, { projection: { totals: 1 } }).then((t) => t!.totals),
    describeConflicts(conflicted, after),
  ]);
  return { estimates: [...after.values()], totals, changed: events.length, conflicts };
}

/** Adds who changed each conflicting cell and when (from the history log). */
async function describeConflicts(
  conflicted: { change: NormalizedChange; current: CellValue }[],
  docs: Map<string, EstimateDoc>,
): Promise<CellConflict[]> {
  if (!conflicted.length) return [];
  const latest = await (await collections.events())
    .find(
      { estimateId: { $in: [...new Set(conflicted.map((c) => c.change.id))] } },
      { projection: { estimateId: 1, field: 1, changedBy: 1, changedAt: 1 } },
    )
    .sort({ changedAt: -1 })
    .toArray();
  const who = new Map<string, { changedBy: string; changedAt: string }>();
  for (const e of latest) {
    const k = `${e.estimateId}|${e.field}`;
    if (!who.has(k)) who.set(k, { changedBy: e.changedBy, changedAt: e.changedAt });
  }
  return conflicted.map(({ change: c, current }) => {
    const w = who.get(`${c.id}|${c.field}`);
    const doc = docs.get(c.id);
    return {
      estimateId: c.id,
      level: c.level,
      ref: c.ref,
      field: c.field,
      yours: c.value,
      current,
      changedBy: w?.changedBy ?? doc?.updatedBy ?? null,
      changedAt: w?.changedAt ?? doc?.updatedAt ?? null,
    };
  });
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
