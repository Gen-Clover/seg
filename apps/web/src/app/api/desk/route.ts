import { route } from "@/server/http";
import { changedByOthers } from "@/server/services/desk";

/** My Desk data that needs the server (the other lists are computed from the summary in the browser). */
export const GET = route(async ({ session }) => ({ changed: await changedByOthers(session) }));
