import { route } from "@/server/http";
import { deleteComment } from "@/server/services/comments";

export const DELETE = route<{ id: string }>(async ({ params, session }) => {
  await deleteComment(params.id, session);
  return { ok: true };
});
