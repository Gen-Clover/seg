import { z } from "zod";
import { readJson, route } from "@/server/http";
import { resolveAccounts } from "@/server/services/accounts";

const bodySchema = z.object({
  keys: z
    .array(z.object({ channelId: z.string().nullable(), orgId: z.string().nullable(), accountId: z.string().nullable() }))
    .max(5000),
});

/** Looks up exact channel / organization / account combinations (upload validation). */
export const POST = route(async ({ request }) => {
  const { keys } = await readJson(request, bodySchema);
  return { accounts: await resolveAccounts(keys) };
});
