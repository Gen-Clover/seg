import { readJson, route } from "@/server/http";
import { listMessages, newMessageSchema, postMessage } from "@/server/services/chat";

/** Latest messages; `?before=` for older pages, `?after=` for new/changed ones (polling). */
export const GET = route<{ id: string }>(async ({ request, params, session }) => {
  const url = new URL(request.url);
  return listMessages(decodeURIComponent(params.id), session, { before: url.searchParams.get("before"), after: url.searchParams.get("after") });
}, { feature: "askAbrams" });

export const POST = route<{ id: string }>(async ({ request, params, session }) => ({
  message: await postMessage(decodeURIComponent(params.id), session, await readJson(request, newMessageSchema)),
}), { write: true, feature: "askAbrams" });
