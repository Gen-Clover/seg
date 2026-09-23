import { z } from "zod";
import type { EstimateDoc } from "@seg/data";
import type { EstimateField } from "@seg/domain";
import type { Session } from "../../auth/session";
import { collections } from "../../db";
import { HttpError } from "../../http";
import { applyEstimateChanges, type EstimateChangeInput } from "../estimates";
import { recordJob } from "../jobs";
import { audit, getSettings, lockFor } from "../settings";

const FIELDS = ["laydownGoal", "laydownEstimate", "sixMonthEstimate", "salesNotes"] as const;

export const bulkSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("clear"),
    scope: z.object({ kind: z.enum(["title", "season"]), value: z.string().trim().min(1) }),
    fields: z.array(z.enum(FIELDS)).min(1),
    apply: z.boolean().default(false),
  }),
  z.object({
    op: z.literal("copy"),
    from: z.string().trim().min(1),
    to: z.array(z.string().trim().min(1)).min(1).max(50),
    fields: z.array(z.enum(FIELDS)).min(1),
    mode: z.enum(["overwrite", "fillBlanks"]).default("fillBlanks"),
    apply: z.boolean().default(false),
  }),
]);
export type BulkInput = z.infer<typeof bulkSchema>;

const blank = (f: EstimateField) => (f === "salesNotes" ? "" : null);
const isBlank = (v: unknown) => v === null || v === undefined || v === "";
const refOf = (e: EstimateDoc) => ({ channelId: e.channelId, channelName: e.channelName, orgId: e.orgId, orgName: e.orgName, accountId: e.accountId, accountName: e.accountName });

interface PlanTitle {
  isbn: string;
  title: string;
  locked: string | null;
  changes: EstimateChangeInput[];
}

async function plan(input: BulkInput): Promise<PlanTitle[]> {
  const settings = await getSettings();
  const titlesCol = await collections.titles();
  const estimates = await collections.estimates();

  if (input.op === "clear") {
    const titles =
      input.scope.kind === "title"
        ? await titlesCol.find({ _id: input.scope.value }, { projection: { title: 1, season: 1 } }).toArray()
        : await titlesCol.find({ season: input.scope.value, inScope: true }, { projection: { title: 1, season: 1 } }).toArray();
    if (!titles.length) throw new HttpError(404, input.scope.kind === "title" ? "That ISBN was not found." : "No titles in that season.");
    const docs = await estimates.find({ isbn: { $in: titles.map((t) => t._id) } }).toArray();
    return titles.map((t) => {
      const lock = lockFor(settings, { isbn: t._id, season: t.season });
      const changes: EstimateChangeInput[] = [];
      for (const e of docs.filter((d) => d.isbn === t._id)) {
        for (const f of input.fields) {
          if (!isBlank(e[f])) changes.push({ level: e.level, ref: refOf(e), field: f, value: blank(f), expected: e[f] });
        }
      }
      return { isbn: t._id, title: t.title, locked: lock ? lock.label : null, changes };
    });
  }

  const source = await titlesCol.findOne({ _id: input.from }, { projection: { title: 1 } });
  if (!source) throw new HttpError(404, "The source ISBN was not found.");
  const targets = await titlesCol.find({ _id: { $in: input.to.filter((t) => t !== input.from) } }, { projection: { title: 1, season: 1 } }).toArray();
  if (!targets.length) throw new HttpError(404, "None of the target ISBNs were found.");
  const [sourceDocs, targetDocs] = await Promise.all([
    estimates.find({ isbn: input.from }).toArray(),
    estimates.find({ isbn: { $in: targets.map((t) => t._id) } }).toArray(),
  ]);
  return targets.map((t) => {
    const lock = lockFor(settings, { isbn: t._id, season: t.season });
    const existing = new Map(targetDocs.filter((d) => d.isbn === t._id).map((d) => [`${d.level}|${JSON.stringify(refOf(d))}`, d]));
    const changes: EstimateChangeInput[] = [];
    for (const s of sourceDocs) {
      const current = existing.get(`${s.level}|${JSON.stringify(refOf(s))}`);
      for (const f of input.fields) {
        const value = s[f];
        if (isBlank(value)) continue;
        const now = current ? current[f] : blank(f);
        if (now === value) continue;
        if (input.mode === "fillBlanks" && !isBlank(now)) continue;
        changes.push({ level: s.level, ref: refOf(s), field: f, value: value ?? null, expected: now ?? blank(f) });
      }
    }
    return { isbn: t._id, title: t.title, locked: lock ? lock.label : null, changes };
  });
}

/** Previews (default) or applies a bulk clear / copy. Applied changes go through the normal save path. */
export async function runBulk(input: BulkInput, admin: Session) {
  const titles = await plan(input);
  const summary = titles.map((t) => ({ isbn: t.isbn, title: t.title, locked: t.locked, cells: t.changes.length }));
  const totalCells = titles.filter((t) => !t.locked).reduce((s, t) => s + t.changes.length, 0);
  if (!input.apply) return { preview: true, titles: summary, totalCells, changed: 0, conflicts: 0 };

  const result = await recordJob("bulk", admin.email, async () => {
    let changed = 0;
    let conflicts = 0;
    for (const t of titles) {
      if (t.locked || !t.changes.length) continue;
      for (let i = 0; i < t.changes.length; i += 2000) {
        const res = await applyEstimateChanges(t.isbn, t.changes.slice(i, i + 2000), admin, "admin");
        changed += res.changed;
        conflicts += res.conflicts.length;
      }
    }
    return { op: input.op, titles: titles.length, changed, conflicts };
  });
  await audit(
    admin,
    "bulk",
    input.op,
    input.op === "clear"
      ? `Cleared ${input.fields.join(", ")} for ${input.scope.kind} ${input.scope.value}: ${result.changed} values`
      : `Copied ${input.fields.join(", ")} from ${input.from} to ${input.to.join(", ")} (${input.mode}): ${result.changed} values`,
  );
  return { preview: false, titles: summary, totalCells, changed: result.changed, conflicts: result.conflicts };
}
