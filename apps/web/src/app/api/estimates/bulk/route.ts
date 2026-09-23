import { z } from "zod";
import { HttpError, readJson, route } from "@/server/http";
import { applyEstimateChanges, estimateChangeSchema, type CellConflict, type EstimateChangeInput } from "@/server/services/estimates";

export const maxDuration = 60;

const bodySchema = z.object({
  changes: z.array(estimateChangeSchema.extend({ isbn: z.string().trim().min(1) })).min(1).max(3000),
});

/**
 * Upload endpoint: cell changes across many titles, applied title by title with the same
 * rules, history and write-back as grid edits. One failing title does not block the others.
 * Changes that carry `expected` are not saved over newer edits; they come back as conflicts.
 */
export const POST = route(
  async ({ request, session }) => {
    const { changes } = await readJson(request, bodySchema);
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
        const res = await applyEstimateChanges(isbn, list, session.email, "upload");
        changed += res.changed;
        conflicts.push(...res.conflicts.map((c) => ({ ...c, isbn })));
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        failed.push({ isbn, error: err.message });
      }
    }
    return { changed, titles: byIsbn.size - failed.length, failed, conflicts };
  },
  { roles: ["admin", "editor"] },
);
