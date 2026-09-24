import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/features/admin/admin-shell";
import { currentSession } from "@/server/auth/current";
import { isDemoEnvironment } from "@/server/services/admin/system";

export const metadata: Metadata = { title: "Admin console" };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const session = await currentSession();
  if (!session) redirect("/api/auth/expired");
  if (session.role !== "admin") redirect("/");
  return <AdminShell demoEnvironment={isDemoEnvironment()}>{children}</AdminShell>;
}
