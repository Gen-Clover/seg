import { route } from "@/server/http";
import { myTitleThreads } from "@/server/services/chat";

/** Title comment threads I'm part of, for the Messages page. */
export const GET = route(async ({ session }) => ({ threads: await myTitleThreads(session) }), { feature: "askAbrams" });
