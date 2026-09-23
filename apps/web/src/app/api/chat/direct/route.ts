import { z } from "zod";
import { readJson, route } from "@/server/http";
import { openDirect } from "@/server/services/chat";

/** Open (or start) a direct conversation. */
export const POST = route(async ({ request, session }) => {
  const { email } = await readJson(request, z.object({ email: z.string().email() }));
  return { roomId: await openDirect(session, email) };
}, { write: true, feature: "askAbrams" });
