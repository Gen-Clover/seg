import { collections } from "@/server/db";
import { route } from "@/server/http";
import { changedByOthers } from "@/server/services/desk";
import { workGroupsFor } from "@/server/services/settings";

/**
 * My Desk data that needs the server: titles changed by others, the person's work groups
 * (their titles are picked in the browser from the summary) and their saved tab order.
 */
export const GET = route(async ({ session }) => {
  const [changed, groups, user] = await Promise.all([
    changedByOthers(session),
    workGroupsFor(session.email),
    (await collections.users()).findOne({ _id: session.email }, { projection: { prefs: 1 } }),
  ]);
  return { changed, groups, tabOrder: user?.prefs?.deskTabs ?? [] };
});
