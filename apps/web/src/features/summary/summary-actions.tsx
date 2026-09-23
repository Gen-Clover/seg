"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { TitleSummaryRow } from "@/lib/queries";
import type { SummaryFilters } from "./filters";

/** Export / meeting report / upload actions (implemented in the import-export phase). */
export function SummaryActions({ rows, disabled }: { rows: TitleSummaryRow[]; filters: SummaryFilters; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={disabled || rows.length === 0}
        onClick={() => toast.info("Exports are coming in the next build step.")}
      >
        <Download />
        Export
      </Button>
    </div>
  );
}
