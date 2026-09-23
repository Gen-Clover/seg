"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { EstimateField, Level } from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { queryKeys } from "@/lib/queries";
import { downloadCsv } from "@/lib/sheets";
import { cn, fmtInt } from "@/lib/utils";
import { applyUpload, previewUpload, type PreviewChange, type Stage, type UploadConflict, type UploadPreview } from "./plan-upload";

type State =
  | { step: "pick"; error?: string }
  | { step: "working"; stage: Stage; fileName: string }
  | { step: "preview"; preview: UploadPreview }
  | { step: "saving"; preview: UploadPreview; done: number; total: number }
  | { step: "done"; preview: UploadPreview; changed: number; failed: { isbn: string; error: string }[]; conflicts: UploadConflict[] };

const FIELD_LABEL: Record<EstimateField, string> = {
  laydownGoal: "Laydown goal",
  laydownEstimate: "Laydown estimate",
  sixMonthEstimate: "6-month estimate",
  salesNotes: "Sales notes",
};
const LEVEL_LABEL: Record<Level, string> = { channel: "Channel", org: "Organization", account: "Account" };
const PREVIEW_LIMIT = 400;

/** Bulk upload of the account-details sheet, with a preview of every change before saving. */
export function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [state, setState] = useState<State>({ step: "pick" });
  const [tab, setTab] = useState<"changes" | "errors">("changes");
  const qc = useQueryClient();
  const busy = state.step === "working" || state.step === "saving";

  const reset = () => {
    setState({ step: "pick" });
    setTab("changes");
  };

  const onFile = async (file: File) => {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setState({ step: "pick", error: "Please choose an Excel or CSV file (.xlsx, .xls, .csv)." });
      return;
    }
    setState({ step: "working", stage: { step: "reading" }, fileName: file.name });
    try {
      const preview = await previewUpload(file, (stage) => setState({ step: "working", stage, fileName: file.name }));
      setTab(preview.changes.length || !preview.errors.length ? "changes" : "errors");
      setState({ step: "preview", preview });
    } catch (err) {
      console.error(err);
      setState({ step: "pick", error: "That file couldn't be read. Check it's a valid spreadsheet and try again." });
    }
  };

  /** Saves changes; `overwrite` re-sends conflicting cells without the version check (user confirmed). */
  const save = async (preview: UploadPreview, changes = preview.changes, overwrite = false, savedBefore = 0) => {
    setState({ step: "saving", preview, done: 0, total: changes.length });
    try {
      const res = await applyUpload(changes, (done, total) => setState({ step: "saving", preview, done, total }), {
        overwrite,
        upload: { id: preview.id, fileName: preview.fileName, rowsRead: preview.rows, errorRows: preview.errors.length },
      });
      const changed = savedBefore + res.changed;
      setState({ step: "done", preview, changed, failed: res.failed, conflicts: res.conflicts });
      await qc.invalidateQueries({ queryKey: queryKeys.summary });
      for (const isbn of new Set(changes.map((c) => c.isbn))) qc.removeQueries({ queryKey: queryKeys.title(isbn) });
      if (res.conflicts.length) {
        toast.warning(`${fmtInt(res.conflicts.length)} cell${res.conflicts.length === 1 ? " was" : "s were"} changed by someone else since the preview — not overwritten.`);
      } else {
        toast.success(`Upload saved: ${fmtInt(changed)} value${changed === 1 ? "" : "s"} updated.`);
      }
    } catch (err) {
      console.error(err);
      toast.error("The upload stopped part-way. Values saved so far are kept; upload the file again to finish.");
      setState({ step: "preview", preview });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent
        title="Upload estimates"
        description="Use the account-details export as the template. You'll see every change before anything is saved."
        className="w-[min(860px,calc(100vw-32px))]"
      >
        {state.step === "pick" ? <Picker onFile={onFile} error={state.error} /> : null}
        {state.step === "working" ? <Working stage={state.stage} fileName={state.fileName} /> : null}
        {state.step === "preview" || state.step === "saving" ? (
          <PreviewBody
            preview={state.preview}
            tab={tab}
            onTab={setTab}
            saving={state.step === "saving" ? { done: state.done, total: state.total } : null}
            onCancel={reset}
            onSave={() => save(state.preview)}
          />
        ) : null}
        {state.step === "done" ? (
          <Done
            changed={state.changed}
            failed={state.failed}
            conflicts={state.conflicts}
            onOverwrite={() =>
              save(
                state.preview,
                state.conflicts.map((c) => ({
                  isbn: c.isbn,
                  title: state.preview.changes.find((x) => x.isbn === c.isbn)?.title ?? c.isbn,
                  level: c.level,
                  ref: c.ref,
                  field: c.field,
                  before: c.current,
                  after: c.yours,
                })),
                true,
                state.changed,
              )
            }
            onAnother={reset}
            onClose={() => {
              onOpenChange(false);
              reset();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Picker({ onFile, error }: { onFile: (f: File) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="p-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file) onFile(file);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line-strong px-6 py-12 text-center transition-colors hover:border-brand/60 hover:bg-surface-2",
          over && "border-brand bg-brand-soft",
        )}
      >
        <FileSpreadsheet className="size-8 text-muted" />
        <span className="text-[14px] font-medium text-ink">Drop a spreadsheet here, or click to choose</span>
        <span className="text-xs text-muted">.xlsx, .xls or .csv · every sheet in the workbook is read</span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
      {error ? <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[13px] text-brand">{error}</p> : null}
      <ul className="mt-4 space-y-1 text-xs text-muted">
        <li>• &quot;Total Organizations / Total Accounts&quot; rows set channel values; &quot;All Accounts&quot; rows set organization values.</li>
        <li>• Blank cells keep the current value. Numbers are rounded to whole units.</li>
        <li>• A new account must be a valid channel, organization and account combination.</li>
      </ul>
    </div>
  );
}

function Working({ stage, fileName }: { stage: Stage; fileName: string }) {
  const label =
    stage.step === "reading"
      ? "Reading the file…"
      : stage.step === "loading"
        ? `Loading current values · ${fmtInt(stage.done)} of ${fmtInt(stage.total)} titles`
        : "Checking every row…";
  const pct = stage.step === "loading" && stage.total ? stage.done / stage.total : stage.step === "checking" ? 1 : 0.05;
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
      <Spinner className="text-brand" />
      <div className="text-[13px] font-medium text-ink">{label}</div>
      <div className="text-xs text-muted">{fileName}</div>
      <Progress value={pct} className="w-64" />
    </div>
  );
}

function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-3", className)}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

const show = (v: number | string | null) => (v === null || v === "" ? "—" : typeof v === "number" ? fmtInt(v) : v);

function rowLabel(c: PreviewChange) {
  if (c.level === "channel") return c.ref.channelName ?? c.ref.channelId ?? "—";
  if (c.level === "org") return `${c.ref.orgName ?? c.ref.orgId} · ${c.ref.channelName ?? c.ref.channelId}`;
  return `${c.ref.accountName ?? c.ref.accountId} · ${c.ref.orgName ?? c.ref.orgId}`;
}

function PreviewBody({
  preview,
  tab,
  onTab,
  saving,
  onCancel,
  onSave,
}: {
  preview: UploadPreview;
  tab: "changes" | "errors";
  onTab: (t: "changes" | "errors") => void;
  saving: { done: number; total: number } | null;
  onCancel: () => void;
  onSave: () => void;
}) {
  const { changes, errors } = preview;
  const stats = [
    { label: "Rows read", value: preview.rows },
    { label: "Titles changing", value: preview.titles },
    { label: "Values changing", value: changes.length, tone: changes.length ? "text-ink" : "" },
    { label: "Rows unchanged", value: preview.unchangedRows },
    { label: "Rows with errors", value: errors.length, tone: errors.length ? "text-warn" : "" },
  ];

  const downloadErrors = () =>
    downloadCsv(
      `Upload errors - ${preview.fileName.replace(/\.[^.]+$/, "")}.csv`,
      ["Sheet", "Row", "ISBN", "Problem"],
      errors.map((e) => [e.sheet, e.rowNumber, e.isbn, e.message]),
    );

  return (
    <div>
      <div className="grid grid-cols-5 border-b border-line">
        {stats.map((s) => (
          <div key={s.label} className="border-r border-line px-4 py-3 last:border-r-0">
            <div className="text-[11px] font-medium text-muted">{s.label}</div>
            <div className={cn("num mt-0.5 text-lg font-semibold text-ink-2", s.tone)}>{fmtInt(s.value)}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-line px-4 pt-2">
        {(["changes", "errors"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
              tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t === "changes" ? "Changes" : "Errors"}{" "}
            <span className="num text-xs text-subtle">{fmtInt(t === "changes" ? changes.length : errors.length)}</span>
          </button>
        ))}
        {tab === "errors" && errors.length ? (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={downloadErrors}>
            Download error list
          </Button>
        ) : null}
      </div>

      <div className="scrollbar-thin max-h-[46vh] overflow-auto">
        {tab === "changes" ? (
          changes.length ? (
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-surface-2 text-left text-[11px] font-medium text-muted">
                <tr>
                  <th className="px-4 py-2">Title</th>
                  <th className="px-2 py-2">Row</th>
                  <th className="px-2 py-2">Field</th>
                  <th className="px-4 py-2 text-right">Change</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, PREVIEW_LIMIT).map((c, i) => (
                  <tr key={i} className="border-t border-line/70 align-top">
                    <td className="max-w-[220px] px-4 py-1.5">
                      <div className="truncate text-ink">{c.title}</div>
                      <div className="num text-[11px] text-subtle">{c.isbn}</div>
                    </td>
                    <td className="max-w-[260px] px-2 py-1.5">
                      <Badge className="mr-1.5">{LEVEL_LABEL[c.level]}</Badge>
                      <span className="text-ink-2">{rowLabel(c)}</span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-ink-2">{FIELD_LABEL[c.field]}</td>
                    <td className="px-4 py-1.5 text-right">
                      <span className="num inline-flex max-w-[240px] items-center gap-1.5">
                        <span className="truncate text-subtle line-through decoration-subtle/60">{show(c.before)}</span>
                        <ArrowRight className="size-3 shrink-0 text-subtle" />
                        <span className="truncate font-medium text-ink">{show(c.after)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 py-12 text-center text-[13px] text-muted">
              {errors.length ? "Nothing to save — see the errors tab." : "This file matches what's already saved. Nothing to change."}
            </p>
          )
        ) : errors.length ? (
          <table className="w-full text-[12.5px]">
            <thead className="sticky top-0 bg-surface-2 text-left text-[11px] font-medium text-muted">
              <tr>
                <th className="px-4 py-2">Sheet · row</th>
                <th className="px-2 py-2">ISBN</th>
                <th className="px-4 py-2">Problem</th>
              </tr>
            </thead>
            <tbody>
              {errors.slice(0, PREVIEW_LIMIT).map((e, i) => (
                <tr key={i} className="border-t border-line/70 align-top">
                  <td className="num whitespace-nowrap px-4 py-1.5 text-ink-2">
                    {e.sheet} · {e.rowNumber}
                  </td>
                  <td className="num px-2 py-1.5 text-ink-2">{e.isbn ?? "—"}</td>
                  <td className="px-4 py-1.5 text-ink">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-12 text-center text-[13px] text-muted">No problems found.</p>
        )}
        {(tab === "changes" ? changes.length : errors.length) > PREVIEW_LIMIT ? (
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            Showing the first {fmtInt(PREVIEW_LIMIT)}.{tab === "errors" ? " Download the error list for all of them." : " All of them will be saved."}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-line px-5 py-3">
        {saving ? (
          <>
            <Progress value={saving.total ? saving.done / saving.total : 0} className="flex-1" />
            <span className="num text-xs text-muted">
              Saving {fmtInt(saving.done)} of {fmtInt(saving.total)}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted">
              {errors.length ? (
                <>
                  <AlertTriangle className="size-3.5 text-warn" />
                  Rows with errors are skipped; everything else can be saved.
                </>
              ) : (
                preview.fileName
              )}
            </span>
            <Button variant="ghost" className="ml-auto" onClick={onCancel}>
              Choose another file
            </Button>
            <Button variant="brand" disabled={!changes.length} onClick={onSave}>
              <Upload />
              Save {fmtInt(changes.length)} change{changes.length === 1 ? "" : "s"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Done({
  changed,
  failed,
  conflicts,
  onOverwrite,
  onAnother,
  onClose,
}: {
  changed: number;
  failed: { isbn: string; error: string }[];
  conflicts: UploadConflict[];
  onOverwrite: () => void;
  onAnother: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
      <CheckCircle2 className="size-9 text-ok" />
      <div className="text-[15px] font-semibold text-ink">Upload saved</div>
      <p className="text-[13px] text-muted">
        {fmtInt(changed)} value{changed === 1 ? "" : "s"} updated. Totals, history and BigQuery are updated automatically.
      </p>
      {failed.length ? (
        <div className="mt-2 w-full max-w-md rounded-lg bg-warn-soft px-3 py-2 text-left text-xs text-warn">
          {failed.length} title{failed.length === 1 ? "" : "s"} couldn&apos;t be saved:{" "}
          {failed.map((f) => `${f.isbn} (${f.error})`).join("; ")}
        </div>
      ) : null}
      {conflicts.length ? (
        <div className="mt-3 w-full max-w-xl rounded-lg border border-warn/30 bg-warn-soft/60 text-left">
          <div className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-warn">
            <AlertTriangle className="size-4" />
            {fmtInt(conflicts.length)} cell{conflicts.length === 1 ? " was" : "s were"} changed by someone else after your preview — kept their value
          </div>
          <ul className="scrollbar-thin max-h-40 overflow-y-auto border-t border-warn/20 px-3 py-1.5 text-xs text-ink-2">
            {conflicts.slice(0, 100).map((c, i) => (
              <li key={i} className="py-1">
                <span className="num">{c.isbn}</span> · {conflictRow(c)} · {FIELD_LABEL[c.field]}:{" "}
                <span className="font-medium text-ink">{show(c.current)}</span>
                {c.changedBy ? <span className="text-muted"> by {c.changedBy.split("@")[0]}</span> : null}
                <span className="text-muted"> (your file: {show(c.yours)})</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-warn/20 px-3 py-2">
            <Button size="sm" variant="outline" onClick={onOverwrite}>
              Overwrite these {fmtInt(conflicts.length)} cell{conflicts.length === 1 ? "" : "s"} with my file
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex gap-2">
        <Button onClick={onAnother}>Upload another file</Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function conflictRow(c: UploadConflict) {
  if (c.level === "channel") return c.ref.channelName ?? c.ref.channelId ?? "—";
  if (c.level === "org") return c.ref.orgName ?? c.ref.orgId ?? "—";
  return c.ref.accountName ?? c.ref.accountId ?? "—";
}
