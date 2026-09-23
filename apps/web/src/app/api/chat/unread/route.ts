import { route } from "@/server/http";
import { unreadTotal } from "@/server/services/chat";

/** Total unread chat messages (sidebar badge). */
export const GET = route(async ({ session }) => ({ unread: await unreadTotal(session) }));
