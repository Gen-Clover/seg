import { readJson, route } from "@/server/http";
import { applyPlanChange, planChangeSchema } from "@/server/services/estimates";

/** Comparable title and title notes. */
export const PATCH = route<{ isbn: string }>(
  async ({ request, params, session }) => {
    const change = await readJson(request, planChangeSchema);
    return applyPlanChange(params.isbn, change, session);
  },
  { roles: ["admin", "editor"], write: true },
);
