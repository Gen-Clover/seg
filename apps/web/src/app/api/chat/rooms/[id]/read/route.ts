import { route } from "@/server/http";
import { markRead } from "@/server/services/chat";

export const POST = route<{ id: string }>(async ({ params, session }) => {
  await markRead(decodeURIComponent(params.id), session);
  return { ok: true };
}, { feature: "askAbrams" });
