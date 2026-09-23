import { z } from "zod";
import { collections } from "@/server/db";
import { HttpError, readJson, route } from "@/server/http";
import { applyEstimateChanges, estimateChangeSchema, type CellConflict, type EstimateChangeInput } from "@/server/services/estimates";

export const maxDuration = 60;

const bodySchema = z.object({
  changes: z.array(estimateChangeSchema.extend({ isbn: z.string().trim().min(1) })).min(1).max(3000),
  /** The spreadsheet this batch comes from (one upload can be sent in several batches). */
  upload: z
    .object({
      id: z.string().min(8).max(80),
      fileName: z.string().max(260),
      rowsRead: z.number().int().min(0),
      errorRows: z.number().int().min(0),
      overwrite: z.boolean().default(false),
    })
    .optional(),
});

/**
 * Upload endpoint: cell changes across many titles, applied title by title with the same
 * rules, history and write-back as grid edits. One failing title (locked, out of the person's
 * divisions, unknown) does not block the others. Changes that carry `expected` are not saved over
 * newer edits; they come back as conflicts. Each upload is summarised in the admin upload log.
 */
export const POST = route(
  async ({ request, session }) => {
    const { changes, upload } = await readJson(request, bodySchema);
    const byIsbn = new Map<string, EstimateChangeInput[]>();
    for (const { isbn, ...change } of changes) {
      const list = byIsbn.get(isbn);
      if (list) list.push(change);
      else byIsbn.set(isbn, [change]);
    }

    let changed = 0;
    const conflicts: (CellConflict & { isbn: string })[] = [];
    const failed: { isbn: string; error: string }[] = [];
    for (const [isbn, list] of byIsbn) {
      try {
        const res = await applyEstimateChanges(isbn, list, session, "upload");
        changed += res.changed;
        conflicts.push(...res.conflicts.map((c) => ({ ...c, isbn })));
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        failed.push({ isbn, error: err.message });
      }
    }

    if (upload) {
      const now = new Date().toISOString();
      await (await collections.uploadLogs()).updateOne(
        { _id: upload.id },
        {
          $setOnInsert: { email: session.email, name: session.name, fileName: upload.fileName, rowsRead: upload.rowsRead, errorRows: upload.errorRows, startedAt: now },
          $set: { finishedAt: now, overwrite: upload.overwrite },
          $inc: { valuesChanged: changed, conflicts: conflicts.length, failedTitles: failed.length, titles: byIsbn.size },
        },
        { upsert: true },
      );
    }
    return { changed, titles: byIsbn.size - failed.length, failed, conflicts };
  },
  { roles: ["admin", "editor"], write: true, feature: "uploads" },
);
