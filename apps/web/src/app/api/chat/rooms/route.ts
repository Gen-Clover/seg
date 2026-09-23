import { readJson, route } from "@/server/http";
import { createGroup, listRooms, newGroupSchema } from "@/server/services/chat";

/** My conversations (Everyone, my groups and direct messages) with unread counts. */
export const GET = route(async ({ session }) => ({ rooms: await listRooms(session) }), { feature: "askAbrams" });

/** Create a group. */
export const POST = route(async ({ request, session }) => ({ room: await createGroup(session, await readJson(request, newGroupSchema)) }), { write: true, feature: "askAbrams" });
