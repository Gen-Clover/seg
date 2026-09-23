import { route } from "@/server/http";
import { searchAccounts } from "@/server/services/accounts";

export const GET = route(async ({ request }) => {
  const url = new URL(request.url);
  return {
    accounts: await searchAccounts({
      q: url.searchParams.get("q") ?? undefined,
      channelId: url.searchParams.get("channelId") ?? undefined,
      orgId: url.searchParams.get("orgId") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
    }),
  };
});
