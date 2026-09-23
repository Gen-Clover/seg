import { z } from "zod";
import { readJson, route } from "@/server/http";
import { markRead } from "@/server/services/comments";

const bodySchema = z.object({ ids: z.array(z.string()).max(500).optional(), all: z.boolean().optional() });

export const POST = route(async ({ request, session }) => {
  const { ids, all } = await readJson(request, bodySchema);
  await markRead(session.email, all ? "all" : (ids ?? []));
  return { ok: true };
});
