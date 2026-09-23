import type { Metadata } from "next";
import { canEdit } from "@/server/auth/session";
import { currentSession } from "@/server/auth/current";
import { TitleView } from "@/features/title/title-view";

export const metadata: Metadata = { title: "Title" };

export default async function TitlePage({ params }: PageProps<"/titles/[isbn]">) {
  const { isbn } = await params;
  const session = await currentSession();
  return <TitleView key={isbn} isbn={isbn} canEdit={!!session && canEdit(session.role)} />;
}
