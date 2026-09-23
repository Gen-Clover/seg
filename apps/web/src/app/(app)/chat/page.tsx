import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatView } from "@/features/chat/chat-view";

export const metadata: Metadata = { title: "Ask Abrams" };

export default function ChatPage() {
  return (
    <Suspense>
      <ChatView />
    </Suspense>
  );
}
