import type { Metadata } from "next";
import { DeskView } from "@/features/desk/desk-view";
import { currentSession } from "@/server/auth/current";

export const metadata: Metadata = { title: "My Desk" };

export default async function DeskPage() {
  const session = await currentSession();
  return <DeskView name={session?.name ?? ""} />;
}
