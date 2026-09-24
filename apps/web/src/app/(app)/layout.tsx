import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { SettingsProvider } from "@/lib/settings";
import { currentSession } from "@/server/auth/current";
import { publicSettings } from "@/server/services/settings";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  if (!session) redirect("/api/auth/expired");
  const settings = await publicSettings();
  return (
    <SettingsProvider initial={settings}>
      <AppShell user={session}>{children}</AppShell>
    </SettingsProvider>
  );
}
