"use client";

import { ChevronDown, Download, FileSpreadsheet, Sheet, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/overlay";
import { useMe, type TitleSummaryRow } from "@/lib/queries";
import { fmtInt } from "@/lib/utils";
import { UploadDialog } from "../upload/upload-dialog";
import { exportAccountDetails, exportSummary } from "./exports";
import type { SummaryFilters } from "./filters";

/** Export and upload for the titles currently shown (legacy Export / Upload buttons). */
export function SummaryActions({ rows, disabled }: { rows: TitleSummaryRow[]; filters: SummaryFilters; disabled?: boolean }) {
  const me = useMe();
  const canEdit = me.data?.user.role === "admin" || me.data?.user.role === "editor";
  const [menu, setMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const count = rows.length;

  const runSummary = async () => {
    setMenu(false);
    await exportSummary(rows);
    toast.success(`Summary exported · ${fmtInt(count)} titles`);
  };

  const runDetails = async (format: "xlsx" | "csv") => {
    setMenu(false);
    setExporting(true);
    const id = toast.loading(`Preparing account details for ${fmtInt(count)} titles…`);
    try {
      const res = await exportAccountDetails(
        rows.map((r) => r.isbn),
        format,
        (done, total) => toast.loading(`Preparing account details · ${fmtInt(done)} of ${fmtInt(total)} titles`, { id }),
      );
      toast.success(`Account details exported · ${fmtInt(res.rows)} rows from ${fmtInt(res.titles)} titles`, { id });
    } catch (err) {
      console.error(err);
      toast.error("The export failed. Please try again.", { id });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {canEdit ? (
        <Button onClick={() => setUploading(true)} disabled={disabled}>
          <Upload />
          Upload
        </Button>
      ) : null}
      <Popover open={menu} onOpenChange={setMenu}>
        <PopoverTrigger asChild>
          <Button variant="primary" disabled={disabled || count === 0 || exporting}>
            <Download />
            {exporting ? "Exporting…" : "Export"}
            <ChevronDown className="-mr-1 opacity-70" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="px-3 pb-1 pt-2 text-[11px] font-medium text-muted">
            {fmtInt(count)} title{count === 1 ? "" : "s"} in the current view
          </div>
          <MenuItem icon={<Sheet />} title="Summary" hint="One row per title with totals · .xlsx" onClick={runSummary} />
          <MenuItem
            icon={<FileSpreadsheet />}
            title="Account details"
            hint="Every channel, organization and account · .xlsx — edit and upload it back"
            onClick={() => runDetails("xlsx")}
          />
          <MenuItem icon={<FileSpreadsheet />} title="Account details (CSV)" hint="Same layout as a .csv file" onClick={() => runDetails("csv")} />
        </PopoverContent>
      </Popover>
      <UploadDialog open={uploading} onOpenChange={setUploading} />
    </div>
  );
}

function MenuItem({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-surface-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
    >
      {icon}
      <span>
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}
