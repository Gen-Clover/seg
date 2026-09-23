import type { Metadata } from "next";
import { Suspense } from "react";
import { SummaryView } from "@/features/summary/summary-view";

export const metadata: Metadata = { title: "Summary" };

export default function SummaryPage() {
  return (
    <Suspense>
      <SummaryView />
    </Suspense>
  );
}
