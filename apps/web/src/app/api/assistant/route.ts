import { z } from "zod";
import { readJson, route } from "@/server/http";
import { askAssistant } from "@/server/services/assistant";

/** Ask Abrams assistant: answers questions from the app's own data (rule-based, no AI service). */
export const POST = route(async ({ request, session }) => {
  const { text } = await readJson(request, z.object({ text: z.string().max(500) }));
  return askAssistant(text, session);
});
