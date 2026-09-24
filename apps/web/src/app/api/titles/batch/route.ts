import { z } from "zod";
import { readJson, route } from "@/server/http";
import { MAX_BATCH_TITLES, getTitleDetails } from "@/server/services/titles";

const bodySchema = z.object({ isbns: z.array(z.string().trim().min(1)).min(1).max(MAX_BATCH_TITLES) });

/** Details for several titles at once (exports, uploads, reports). POST because ISBN lists get long. */
export const POST = route(async ({ request, session }) => {
  const { isbns } = await readJson(request, bodySchema);
  return getTitleDetails(isbns, session);
});
