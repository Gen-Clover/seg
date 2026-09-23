import { env } from "@/server/env";
import { route } from "@/server/http";

export const GET = route(async ({ session }) => ({
  user: session,
  mainMenuUrl: env().MAIN_MENU_URL || null,
}));
