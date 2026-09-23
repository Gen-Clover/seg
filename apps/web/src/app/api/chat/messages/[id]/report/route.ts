import { readJson, route } from "@/server/http";
import { reportMessage, reportSchema } from "@/server/services/chat";

/** Report a message to the admins. */
export const POST = route<{ id: string }>(async ({ request, params, session }) => {
  const { reason } = await readJson(request, reportSchema);
  await reportMessage(params.id, session, reason);
  return { ok: true };
}, { feature: "askAbrams" });
