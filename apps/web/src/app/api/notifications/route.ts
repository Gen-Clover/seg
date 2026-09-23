import { route } from "@/server/http";
import { listNotifications, unreadCount } from "@/server/services/comments";

/** My mentions and replies. `?count=1` returns only the unread count (cheap badge polling). */
export const GET = route(async ({ request, session }) => {
  if (new URL(request.url).searchParams.get("count") === "1") return { unread: await unreadCount(session.email) };
  return listNotifications(session.email);
});
