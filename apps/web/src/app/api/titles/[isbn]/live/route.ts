import { z } from "zod";
import { readJson, route } from "@/server/http";
import { liveTick } from "@/server/services/live";

const bodySchema = z.object({
  cursor: z.string().max(200).nullable(),
  cell: z.string().max(1000).nullable(),
});

/** Heartbeat while a title is open: presence, visit, and other people's saved changes. */
export const POST = route<{ isbn: string }>(async ({ request, params, session }) => {
  const { cursor, cell } = await readJson(request, bodySchema);
  return liveTick(params.isbn, session, cursor, cell);
}, { feature: "liveTeamwork" });
