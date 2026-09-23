import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "@/features/chat/chat-view";
import { FeatureOff } from "@/components/feature-off";
import { getSettings } from "@/server/services/settings";

export const metadata: Metadata = { title: "Ask Abrams" };

export default async function ChatPage() {
  if (!(await getSettings()).features.askAbrams) return <FeatureOff name="Ask Abrams" />;
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
