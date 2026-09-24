import { route } from "@/server/http";
import { publicSettings } from "@/server/services/settings";

/** Admin-controlled switches, rules, banners and wording every signed-in page needs. */
export const GET = route(async () => publicSettings());
