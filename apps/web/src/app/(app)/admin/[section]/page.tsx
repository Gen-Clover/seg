import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminSection } from "@/features/admin/sections";
import { findPage } from "@/features/admin/modules";
import { isDemoEnvironment } from "@/server/services/admin/system";

export async function generateMetadata({ params }: PageProps<"/admin/[section]">): Promise<Metadata> {
  const found = findPage((await params).section);
  return { title: found ? `${found.page.label} · Admin` : "Admin" };
}

export default async function AdminSectionPage({ params }: PageProps<"/admin/[section]">) {
  const { section } = await params;
  const found = findPage(section);
  if (!found || (found.page.demoOnly && !isDemoEnvironment())) notFound();
  return <AdminSection slug={section} />;
}
