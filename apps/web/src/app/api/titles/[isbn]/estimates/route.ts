import { readJson, route } from "@/server/http";
import { applyEstimateChanges, estimateChangesSchema } from "@/server/services/estimates";

/** Autosave endpoint: a batch of cell edits for one title. */
export const PATCH = route<{ isbn: string }>(
  async ({ request, params, session }) => {
    const { changes } = await readJson(request, estimateChangesSchema);
    return applyEstimateChanges(params.isbn, changes, session.email);
  },
  { roles: ["admin", "editor"] },
);
