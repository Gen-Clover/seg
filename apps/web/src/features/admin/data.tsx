"use client";

import { Activity, FileClock, Play, RefreshCcw, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn, fmtInt } from "@/lib/utils";
import type { syncHealth } from "@/server/services/admin/system";
import {
  CheckboxGroup,
  Loading,
  PageHeader,
  SaveBar,
  Section,
  SelectField,
  SettingRow,
  Stat,
  StatusDot,
  Table,
  When,
  duration,
  fmtMs,
  useAdmin,
  useAdminAction,
  useSectionDraft,
} from "./ui";

interface JobRun {
  _id: string;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  detail: Record<string, unknown>;
  error?: string | null;
  by?: string;
}
interface JobsView {
  last: Record<string, JobRun | null>;
  history: JobRun[];
  retentionDays: number;
}

const JOBS: { id: "ingest" | "writeback" | "trends" | "apply-rules"; label: string; help: string; schedule: string }[] = [
  { id: "ingest", label: "Data refresh from BigQuery", help: "Reloads titles, initial orders, sales and the account catalog from BigQuery.", schedule: "Daily at 06:00 UTC" },
  { id: "writeback", label: "Write-back to BigQuery", help: "Sends saved changes, comments, chat and settings to BigQuery.", schedule: "Within seconds of each change, and every day as a safety net" },
  { id: "trends", label: "Season trends", help: "Rebuilds the weekly totals behind the dashboard trend charts.", schedule: "Daily after the data refresh" },
  { id: "apply-rules", label: "Apply business rules", help: "Recomputes which titles are in scope and every title's totals with the current rules.", schedule: "When business rules are saved" },
];

const JOB_LABEL: Record<string, string> = {
  ingest: "Data refresh",
  writeback: "Write-back",
  trends: "Trends",
  "apply-rules": "Apply rules",
  bulk: "Bulk action",
  "demo-reset": "Demo reset",
  seed: "Seed",
};

/** A short, readable summary of a job's counts. */
function summary(run: JobRun): string {
  const d = run.detail;
  const n = (k: string) => (typeof d[k] === "number" ? fmtInt(d[k] as number) : null);
  const parts: string[] = [];
  if (run.job === "ingest") {
    if (n("titles")) parts.push(`${n("titles")} titles`);
    if (n("facts")) parts.push(`${n("facts")} order rows`);
    if (n("accounts")) parts.push(`${n("accounts")} accounts`);
  } else if (run.job === "writeback") {
    parts.push(`${n("sent") ?? 0} edits`, `${n("comments") ?? 0} comments`, `${n("chat") ?? 0} chat`);
  } else if (run.job === "trends") {
    if (n("titles")) parts.push(`${n("titles")} titles`);
  } else if (run.job === "apply-rules") {
    if (n("inScope")) parts.push(`${n("inScope")} in scope`);
    if (n("changed") !== null) parts.push(`${n("changed")} changed`);
    if (d.mode === "full-refresh") parts.push("full refresh");
  } else if (run.job === "bulk") {
    parts.push(`${String(d.op ?? "")} · ${n("changed") ?? 0} values`);
  } else if (run.job === "demo-reset") {
    parts.push(`${n("restoredEstimates") ?? 0} estimates reloaded`);
  }
  return parts.join(" · ");
}

function RunBadge({ run }: { run: JobRun | null }) {
  if (!run) return <Badge>Never run</Badge>;
  if (run.ok === null) return <Badge tone="info">Running</Badge>;
  return run.ok ? <Badge tone="ok">Succeeded</Badge> : <Badge tone="warn">Failed</Badge>;
}

/* ---------------- Data refresh ---------------- */

export function RefreshPage() {
  const jobs = useAdmin<JobsView>("jobs?limit=30", { refetchInterval: 15_000 });
  const [running, setRunning] = useState<string | null>(null);
  const run = useAdminAction((job: string) => api(`/api/admin/jobs/${job}/run`, { method: "POST" }), (_o) => "Finished.");
  const start = (job: string) => {
    if (job === "ingest" && !window.confirm("Reload all reference data from BigQuery now? It takes a minute or two; people can keep working.")) return;
    setRunning(job);
    run.mutate(job, { onSettled: () => setRunning(null) });
  };
  return (
    <>
      <PageHeader icon={RefreshCcw} title="Data refresh" description="The scheduled jobs that keep SEG in step with BigQuery. Each shows its last run; use Run now to start one immediately." />
      {!jobs.data ? (
        <Loading rows={6} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {JOBS.map((j) => {
            const last = jobs.data.last[j.id] ?? null;
            return (
              <Section key={j.id} className="flex flex-col" data-testid={`job-${j.id}`}>
                <div className="flex items-start justify-between gap-3 px-5 pt-4">
                  <div>
                    <h2 className="text-[14px] font-semibold">{j.label}</h2>
                    <p className="text-[12.5px] text-muted">{j.help}</p>
                  </div>
                  <RunBadge run={last} />
                </div>
                <dl className="grid grid-cols-3 gap-3 px-5 py-3 text-[12.5px]">
                  <div>
                    <dt className="text-muted">Last run</dt>
                    <dd className="font-medium">
                      <When iso={last?.startedAt} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Took</dt>
                    <dd className="font-medium">{last ? (typeof last.detail.ms === "number" ? fmtMs(last.detail.ms) : duration(last.startedAt, last.finishedAt)) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Started by</dt>
                    <dd className="truncate font-medium">{last?.by ?? "—"}</dd>
                  </div>
                </dl>
                <div className="px-5 text-[12.5px] text-ink-2">{last ? summary(last) || "—" : null}</div>
                {last?.error ? <div className="mx-5 mt-2 rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{last.error}</div> : null}
                <div className="mt-auto flex items-center justify-between gap-2 px-5 py-3">
                  <span className="text-[11.5px] text-subtle">{j.schedule}</span>
                  <Button size="sm" onClick={() => start(j.id)} disabled={!!running}>
                    {running === j.id ? <Spinner className="size-3.5" /> : <Play />}
                    {running === j.id ? "Running…" : "Run now"}
                  </Button>
                </div>
              </Section>
            );
          })}
        </div>
      )}
      <div className="h-6" />
    </>
  );
}

/* ---------------- Sync health ---------------- */

type Sync = Awaited<ReturnType<typeof syncHealth>>;

export function SyncPage() {
  const sync = useAdmin<Sync>("sync", { refetchInterval: 10_000 });
  const retry = useAdminAction(() => api("/api/admin/sync/retry", { method: "POST" }), "Sent to BigQuery.");
  const s = sync.data;
  const pending = s ? Object.values(s.pending).reduce((a, b) => a + b, 0) : 0;
  const LABEL: Record<string, string> = { edits: "Estimate changes", comments: "Comments", chatRooms: "Chat conversations", chatMessages: "Chat messages", users: "Users", settings: "Settings" };
  return (
    <>
      <PageHeader
        icon={Activity}
        title="BigQuery sync health"
        description="Every change is saved here first (so the app stays fast), then copied to BigQuery within seconds. Power BI reads BigQuery."
        actions={
          <Button onClick={() => retry.mutate(undefined)} disabled={retry.isPending || s?.mode === "none"}>
            {retry.isPending ? <Spinner className="size-3.5" /> : <RotateCcw />}
            Send now
          </Button>
        }
      />
      {!s ? (
        <Loading />
      ) : (
        <>
          {s.mode === "none" ? (
            <div className="rounded-xl border border-info/25 bg-info-soft px-4 py-3 text-[13px]">
              Write-back is <b>off</b> in this environment (preview): changes stay in this environment&apos;s database and are not sent to BigQuery.
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Waiting to send" value={fmtInt(pending)} tone={pending > 500 ? "warn" : pending ? "info" : "ok"} sub={s.oldestPendingEdit ? <>oldest change <When iso={s.oldestPendingEdit} /></> : "nothing waiting"} />
            <Stat label="Last successful send" value={s.lastSuccessAt ? <When iso={s.lastSuccessAt} /> : "—"} sub={s.lastSent ? `${fmtInt(s.lastSent)} records` : undefined} />
            <Stat label="Status" value={s.lastError ? "Error" : "Healthy"} tone={s.lastError ? "warn" : "ok"} sub={s.lastErrorAt ? <>last error <When iso={s.lastErrorAt} /></> : "no errors"} />
            <Stat label="Mode" value={s.mode === "none" ? "Off" : "On"} sub={`WRITEBACK=${s.mode}`} />
          </div>
          {s.lastError ? <div className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink">Last error: {s.lastError}</div> : null}
          <Section title="Waiting by type">
            <Table head={["Type", "Waiting", ""]}>
              {Object.entries(s.pending).map(([k, v]) => (
                <tr key={k}>
                  <td>{LABEL[k] ?? k}</td>
                  <td className="num">{fmtInt(v)}</td>
                  <td>
                    <StatusDot ok={v === 0} warn={v > 0} />
                  </td>
                </tr>
              ))}
            </Table>
          </Section>
        </>
      )}
      <div className="h-6" />
    </>
  );
}

/* ---------------- Job history ---------------- */

export function JobsPage() {
  const [job, setJob] = useState("");
  const jobs = useAdmin<JobsView>(`jobs?limit=200${job ? `&job=${job}` : ""}`, { refetchInterval: 20_000 });
  const d = useSectionDraft("retention");
  const purge = useAdminAction(() => api<{ deleted: number }>("/api/admin/jobs/purge", { method: "POST" }), (r) => `Removed ${fmtInt(r.deleted)} old records.`);
  const r = d.draft;
  const RET = [30, 90, 180, 365, 730];
  const opts = (v: number) => [...new Set([...RET, v])].sort((a, b) => a - b).map((n) => ({ value: n, label: n >= 365 ? `${n / 365} year${n === 365 ? "" : "s"}` : `${n} days` }));

  return (
    <>
      <PageHeader icon={FileClock} title="Job history" description="Every job run — scheduled or started by an admin — with its result." />
      <Section
        title="Runs"
        actions={
          <SelectField
            label="Job"
            value={job}
            onChange={setJob}
            options={[{ value: "", label: "All jobs" }, ...Object.entries(JOB_LABEL).map(([value, label]) => ({ value, label }))]}
          />
        }
      >
        {!jobs.data ? (
          <Loading />
        ) : (
          <Table head={["Job", "Started", "Took", "By", "Result", "Details"]} empty={!jobs.data.history.length} className="max-h-[520px]">
            {jobs.data.history.map((h) => (
              <tr key={h._id}>
                <td className="font-medium">{JOB_LABEL[h.job] ?? h.job}</td>
                <td className="text-xs">
                  <When iso={h.startedAt} />
                </td>
                <td className="num text-xs">{typeof h.detail.ms === "number" ? fmtMs(h.detail.ms) : duration(h.startedAt, h.finishedAt)}</td>
                <td className="text-xs">{h.by ?? "—"}</td>
                <td>
                  <RunBadge run={h} />
                </td>
                <td className={cn("max-w-[360px] truncate text-xs", h.error ? "text-warn" : "text-ink-2")} title={h.error ?? summary(h)}>
                  {h.error ?? summary(h)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      {r ? (
        <Section title="Retention" description="Old records are removed automatically after these periods.">
          <SettingRow label="Job history" changed={r.jobHistoryDays !== d.data?.settings.retention.jobHistoryDays}>
            <div className="flex items-center gap-2">
              <SelectField label="Job history retention" value={r.jobHistoryDays} onChange={(jobHistoryDays) => d.set({ jobHistoryDays })} options={opts(r.jobHistoryDays)} />
              <Button size="sm" variant="ghost" onClick={() => purge.mutate(undefined)} disabled={purge.isPending}>
                <Trash2 />
                Remove older now
              </Button>
            </div>
          </SettingRow>
          <SettingRow label="Sign-in log" changed={r.signInLogDays !== d.data?.settings.retention.signInLogDays}>
            <SelectField label="Sign-in log retention" value={r.signInLogDays} onChange={(signInLogDays) => d.set({ signInLogDays })} options={opts(r.signInLogDays)} />
          </SettingRow>
          <SettingRow label="Assistant questions" changed={r.assistantLogDays !== d.data?.settings.retention.assistantLogDays}>
            <SelectField label="Assistant log retention" value={r.assistantLogDays} onChange={(assistantLogDays) => d.set({ assistantLogDays })} options={opts(r.assistantLogDays)} />
          </SettingRow>
          <div className="px-5 pb-3">
            <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} note="New periods apply to records created from now on." />
          </div>
        </Section>
      ) : null}
      <div className="h-6" />
    </>
  );
}

/* ---------------- Demo reset ---------------- */

export function DemoResetPage() {
  const [what, setWhat] = useState<string[]>(["clearChat", "clearComments"]);
  const reset = useAdminAction(
    () =>
      api<{ cleared: Record<string, number>; restoredEstimates: number }>("/api/admin/demo/reset", {
        method: "POST",
        json: { clearChat: what.includes("clearChat"), clearComments: what.includes("clearComments"), reloadEstimates: what.includes("reloadEstimates") },
      }),
    (r) => `Demo reset done${r.restoredEstimates ? ` · ${fmtInt(r.restoredEstimates)} estimates reloaded` : ""}.`,
  );
  return (
    <>
      <PageHeader
        icon={RotateCcw}
        title="Demo reset"
        description="Puts the demo back to a clean state before showing it. Only available with demo sign-in — this page doesn't exist in production."
      />
      <Section>
        <SettingRow label="What to reset" stacked>
          <CheckboxGroup
            options={[
              { value: "clearChat", label: "Ask Abrams chat", hint: "Messages, groups, reports and assistant questions" },
              { value: "clearComments", label: "Comments", hint: "All title comments and notifications" },
              { value: "reloadEstimates", label: "Reload estimates from BigQuery", hint: "Throws away estimates saved here and reloads BigQuery's latest values" },
            ]}
            value={what}
            onChange={setWhat}
          />
        </SettingRow>
        <div className="flex items-center gap-3 border-t border-line bg-surface-2/40 px-5 py-3">
          <Button
            variant="danger"
            disabled={!what.length || reset.isPending}
            onClick={() => window.confirm("Reset the demo? This can't be undone.") && reset.mutate(undefined)}
            data-testid="demo-reset"
          >
            {reset.isPending ? <Spinner className="size-3.5" /> : <RotateCcw />}
            Reset demo
          </Button>
          <span className="text-[12.5px] text-muted">Who is online and title visits are cleared too. Users, settings and the catalog are kept.</span>
        </div>
      </Section>
    </>
  );
}
