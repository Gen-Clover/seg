"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui/misc";
import { cn, fmtInt, timeAgo } from "@/lib/utils";
import type { overview } from "@/server/services/admin/system";
import { ADMIN_MODULES } from "./modules";
import { LastSaved, Loading, PageHeader, useAdmin } from "./ui";

type Overview = Awaited<ReturnType<typeof overview>>;

const FEATURE_NAMES: Record<string, string> = {
  dashboard: "Dashboard",
  askAbrams: "Ask Abrams",
  comments: "Comments",
  liveTeamwork: "Live teamwork",
  uploads: "Uploads",
  exports: "Exports",
  meetingReport: "Meeting report",
};

/** One-line status per module, so the landing page shows what needs attention. */
function statusFor(id: string, o: Overview): { text: string; tone: "ok" | "warn" | "neutral" | "info" }[] {
  switch (id) {
    case "people":
      return [
        { text: `${fmtInt(o.users.active)} active users`, tone: "neutral" },
        { text: `${fmtInt(o.users.admins)} admin${o.users.admins === 1 ? "" : "s"}`, tone: "neutral" },
        { text: `${fmtInt(o.users.online)} online now`, tone: o.users.online ? "ok" : "neutral" },
        ...(o.demo.environment ? [{ text: o.demo.allowDemoLogins ? "Demo logins on" : "Demo logins off", tone: "info" as const }] : []),
      ];
    case "planning":
      return [{ text: o.locks ? `${o.locks} lock${o.locks === 1 ? "" : "s"} active` : "Nothing locked", tone: o.locks ? "warn" : "neutral" }];
    case "data":
      return [
        {
          text: o.lastIngest ? `Data refreshed ${timeAgo(o.lastIngest.at)}${o.lastIngest.ok === false ? " (failed)" : ""}` : "No data refresh recorded yet",
          tone: o.lastIngest?.ok === false ? "warn" : "neutral",
        },
        {
          text: o.sync.mode === "none" ? "Write-back off (preview)" : o.sync.pending ? `${fmtInt(o.sync.pending)} waiting for BigQuery` : "BigQuery up to date",
          tone: o.sync.lastError ? "warn" : o.sync.mode === "none" ? "info" : "ok",
        },
        ...(o.failedJobs ? [{ text: `${o.failedJobs} failed job${o.failedJobs === 1 ? "" : "s"} this week`, tone: "warn" as const }] : []),
      ];
    case "audit":
      return [{ text: "Every change, upload and sign-in", tone: "neutral" }];
    case "communication":
      return [
        { text: o.reports ? `${o.reports} reported message${o.reports === 1 ? "" : "s"}` : "No reports", tone: o.reports ? "warn" : "neutral" },
        { text: `${o.announcements} announcement${o.announcements === 1 ? "" : "s"} showing`, tone: o.announcements ? "info" : "neutral" },
        ...(o.unanswered ? [{ text: `${o.unanswered} unanswered question${o.unanswered === 1 ? "" : "s"}`, tone: "neutral" as const }] : []),
      ];
    case "system":
      return [
        { text: o.maintenance ? "Maintenance mode ON" : "Normal operation", tone: o.maintenance ? "warn" : "ok" },
        { text: o.featuresOff.length ? `Off: ${o.featuresOff.map((f) => FEATURE_NAMES[f] ?? f).join(", ")}` : "All features on", tone: o.featuresOff.length ? "info" : "neutral" },
      ];
  }
  return [];
}

export function AdminOverview() {
  const data = useAdmin<Overview>("overview", { refetchInterval: 30_000 });
  const o = data.data;
  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Admin console"
        description="Everything you can control in SEG, grouped by module. Changes are saved to the database, recorded in Admin changes, and copied to BigQuery."
        actions={o ? <LastSaved meta={{ updatedAt: o.settingsUpdatedAt, updatedBy: o.settingsUpdatedBy }} /> : null}
      />
      {!o ? (
        <Card>
          <Loading rows={6} />
        </Card>
      ) : (
        <div className="grid gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3">
          {ADMIN_MODULES.map((m) => (
            <Card key={m.id} className="flex flex-col p-0" data-testid={`admin-module-${m.id}`}>
              <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <m.icon className="size-[18px]" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold">{m.label}</h2>
                  <p className="text-[12.5px] leading-snug text-muted">{m.description}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 px-4 pt-3" suppressHydrationWarning>
                {statusFor(m.id, o).map((s) => (
                  <Badge key={s.text} tone={s.tone === "neutral" ? "neutral" : s.tone}>
                    {s.text}
                  </Badge>
                ))}
              </div>
              <ul className="flex flex-1 flex-col px-2 py-2">
                {m.pages
                  .filter((p) => !p.demoOnly || o.demo.environment)
                  .map((p) => (
                    <li key={p.slug}>
                      <Link href={`/admin/${p.slug}`} className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                        <p.icon className="size-4 shrink-0 text-muted group-hover:text-brand" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium">{p.label}</span>
                          <span className="block truncate text-[11.5px] text-subtle">{p.description}</span>
                        </span>
                        <ArrowRight className={cn("size-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100")} />
                      </Link>
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
