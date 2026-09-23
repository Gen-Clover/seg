import { route } from "@/server/http";
import { getSettings } from "@/server/services/settings";

export const GET = route(async ({ session }) => ({
  user: session,
  mainMenuUrl: (await getSettings()).branding.mainMenuUrl || null,
}));
