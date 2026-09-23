"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/misc";
import { useSummary } from "@/lib/queries";
import { useWorklist } from "@/lib/worklist";

/** "Title workspace" without a title: open the first title of the current list. */
export default function TitlesIndex() {
  const router = useRouter();
  const worklist = useWorklist();
  const summary = useSummary();
  useEffect(() => {
    const first = worklist?.isbns[0] ?? summary.data?.titles[0]?.isbn;
    if (first) router.replace(`/titles/${first}`);
  }, [worklist, summary.data, router]);
  return (
    <div className="p-6">
      <Skeleton className="h-8 w-80" />
    </div>
  );
}
