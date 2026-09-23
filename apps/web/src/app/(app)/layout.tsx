import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { currentSession } from "@/server/auth/current";
import { env } from "@/server/env";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  if (!session) redirect("/login");
  return (
    <AppShell user={session} mainMenuUrl={env().MAIN_MENU_URL || null}>
      {children}
    </AppShell>
  );
}
