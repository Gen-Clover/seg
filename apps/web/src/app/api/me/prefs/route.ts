import { z } from "zod";
import { collections } from "@/server/db";
import { readJson, route } from "@/server/http";

const prefsSchema = z.object({
  /** My Desk tab ids in the order the person arranged them. */
  deskTabs: z.array(z.string().min(1).max(80)).max(200),
});

/** Saves the signed-in person's own preferences (kept across sign-ins and browsers). */
export const PUT = route(async ({ request, session }) => {
  const { deskTabs } = await readJson(request, prefsSchema);
  await (await collections.users()).updateOne({ _id: session.email }, { $set: { "prefs.deskTabs": deskTabs } });
  return { ok: true };
});
