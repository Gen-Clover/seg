import { readJson, route } from "@/server/http";
import { updateGroup, updateGroupSchema } from "@/server/services/chat";

/** Rename a group, add people, or leave it. */
export const PATCH = route<{ id: string }>(async ({ request, params, session }) => {
  await updateGroup(decodeURIComponent(params.id), session, await readJson(request, updateGroupSchema));
  return { ok: true };
});
