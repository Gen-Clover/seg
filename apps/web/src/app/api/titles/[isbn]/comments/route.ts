import { readJson, route } from "@/server/http";
import { listComments, newCommentSchema, postComment } from "@/server/services/comments";

/** Comments on a title and its rows (oldest first). Everyone signed in can read and comment. */
export const GET = route<{ isbn: string }>(async ({ params }) => ({ comments: await listComments(params.isbn) }), { feature: "comments" });

export const POST = route<{ isbn: string }>(async ({ request, params, session }) => {
  const input = await readJson(request, newCommentSchema);
  return { comment: await postComment(params.isbn, session, input) };
}, { write: true, feature: "comments" });
