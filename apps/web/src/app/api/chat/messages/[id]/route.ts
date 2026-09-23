import { z } from "zod";
import { readJson, route } from "@/server/http";
import { deleteMessage, editMessage } from "@/server/services/chat";

export const PATCH = route<{ id: string }>(async ({ request, params, session }) => {
  const { body } = await readJson(request, z.object({ body: z.string().max(4000) }));
  await editMessage(params.id, session, body);
  return { ok: true };
});

export const DELETE = route<{ id: string }>(async ({ params, session }) => {
  await deleteMessage(params.id, session);
  return { ok: true };
});
