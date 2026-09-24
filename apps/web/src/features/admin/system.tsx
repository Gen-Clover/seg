"use client";

import { HeartPulse, Palette, RefreshCcw, ToggleRight, Wrench } from "lucide-react";
import { useState } from "react";
import { BrandMark, BrandName } from "@/components/brand";
import { coverUrl } from "@/features/title/title-cover";
import { Button } from "@/components/ui/button";
import { Input, Spinner, Textarea } from "@/components/ui/misc";
import { fmtInt } from "@/lib/utils";
import type { health } from "@/server/services/admin/system";
import { LastSaved, Loading, PageHeader, SaveBar, Section, SettingRow, Stat, StatusDot, Switch, Table, When, useAdmin, useSectionDraft } from "./ui";

/* ---------------- Feature switches ---------------- */

const FEATURES: { key: "dashboard" | "askAbrams" | "comments" | "liveTeamwork" | "uploads" | "exports" | "meetingReport"; label: string; help: string }[] = [
  { key: "dashboard", label: "Season dashboard", help: "The Dashboard view on the Summary page (charts, trends, insights)." },
  { key: "askAbrams", label: "Ask Abrams", help: "Team chat, the assistant and the chat dock in the corner." },
  { key: "comments", label: "Comments", help: "Comment threads on titles and rows." },
  { key: "liveTeamwork", label: "Live teamwork", help: "See who else is on a title and their changes as they happen." },
  { key: "uploads", label: "Spreadsheet uploads", help: "Upload on the Summary page." },
  { key: "exports", label: "Exports", help: "Summary and account-detail downloads (Excel and CSV)." },
  { key: "meetingReport", label: "Meeting report", help: "The PDF meeting report." },
];

export function FeaturesPage() {
  const d = useSectionDraft("features");
  const r = d.draft;
  const saved = d.data?.settings.features;
  if (!r || !saved) return <Loading rows={7} />;
  return (
    <>
      <PageHeader
        icon={ToggleRight}
        title="Feature switches"
        description="Turn modules on or off for everyone in this environment. Switching one off hides it and blocks it on the server; nothing is deleted, so switching it back on restores it as it was."
        actions={<LastSaved meta={d.data?.meta} />}
      />
      <Section>
        {FEATURES.map((f) => (
          <SettingRow key={f.key} label={f.label} help={f.help} changed={r[f.key] !== saved[f.key]}>
            <Switch label={f.label} checked={r[f.key]} onChange={(v) => d.set({ [f.key]: v })} />
          </SettingRow>
        ))}
      </Section>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} note="Open browsers pick up the change within a minute." />
    </>
  );
}

/* ---------------- Maintenance mode ---------------- */

export function MaintenancePage() {
  const d = useSectionDraft("maintenance");
  const r = d.draft;
  const saved = d.data?.settings.maintenance;
  if (!r || !saved) return <Loading />;
  return (
    <>
      <PageHeader
        icon={Wrench}
        title="Maintenance mode"
        description="Makes SEG read-only for everyone except admins — for example during a data migration. Everyone sees a banner with your message. Reading, searching and exporting keep working."
      />
      <Section>
        <SettingRow label="Maintenance mode" help={saved.on ? "SEG is read-only right now." : "SEG is working normally."} changed={r.on !== saved.on}>
          <Switch label="Maintenance mode" checked={r.on} onChange={(on) => d.set({ on })} />
        </SettingRow>
        <SettingRow label="Message" help="Shown in the banner and when someone tries to change something." changed={r.message !== saved.message} stacked>
          <Textarea rows={2} value={r.message} onChange={(e) => d.set({ message: e.target.value })} maxLength={300} />
        </SettingRow>
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[13px]">
            <Wrench className="size-4 shrink-0 text-warn" />
            <span>
              <span className="font-semibold">Maintenance mode.</span> {r.message}
            </span>
          </div>
        </div>
      </Section>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} />
    </>
  );
}

/* ---------------- Branding ---------------- */

export function BrandingPage() {
  const d = useSectionDraft("branding");
  const r = d.draft;
  const saved = d.data?.settings.branding;
  if (!r || !saved) return <Loading rows={5} />;
  const text = (key: keyof typeof r, label: string, help: string, max: number, long?: boolean) => (
    <SettingRow label={label} help={help} changed={r[key] !== saved[key]} stacked>
      {long ? (
        <Textarea rows={3} value={r[key]} onChange={(e) => d.set({ [key]: e.target.value })} maxLength={max} />
      ) : (
        <Input value={r[key]} onChange={(e) => d.set({ [key]: e.target.value })} maxLength={max} className="max-w-md" />
      )}
    </SettingRow>
  );
  return (
    <>
      <PageHeader icon={Palette} title="Branding and text" description="The name and wording people see in the sidebar and on the sign-in page." actions={<LastSaved meta={d.data?.meta} />} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Section>
          {text("appName", "App name", "Short name in the sidebar and on the sign-in page. Original: SEG.", 20)}
          {text("subtitle", "Subtitle", "Under the name. Original: Seasonal Estimate Grid.", 60)}
          {text("loginHeadline", "Sign-in headline", "Large heading on the sign-in page. Keep “Seasonal Estimate Grid” to show the red S-E-G initials.", 80)}
          {text("loginText", "Sign-in text", "The paragraph under the headline.", 400, true)}
          {text("mainMenuUrl", "Main menu link", "Where “Main menu” in the sidebar goes (e.g. the Abrams intranet). Leave empty to hide the link.", 300)}
        </Section>
        <div className="space-y-3">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted">Preview</div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-7" />
              <BrandName name={r.appName || "SEG"} subtitle={r.subtitle} />
            </div>
          </div>
          <div className="rounded-xl bg-[#1c1916] p-5 text-white">
            <div className="flex items-center gap-2.5">
              <BrandMark className="size-8" />
              <BrandName inverted name={r.appName || "SEG"} subtitle={r.subtitle} />
            </div>
            <div className="mt-5 font-display text-[20px] font-semibold leading-tight">{r.loginHeadline}</div>
            <p className="mt-2 text-[12px] leading-relaxed text-white/70">{r.loginText}</p>
          </div>
        </div>
      </div>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} />
      <CoversSection />
    </>
  );
}

/** Cover images on the title workspace (Firebrand/TMM address pattern, as in the Abrams Title app). */
function CoversSection() {
  const d = useSectionDraft("covers");
  const r = d.draft;
  const saved = d.data?.settings.covers;
  const [isbn, setIsbn] = useState("9781419772016");
  if (!r || !saved) return null;
  const url = coverUrl(r.urlTemplate, isbn);
  return (
    <>
      <Section title="Title covers" description="The cover shown on each title's workspace. When an image is missing or can't be loaded, a “No cover available” panel is shown instead.">
        <SettingRow label="Show cover images" changed={r.enabled !== saved.enabled}>
          <Switch label="Show cover images" checked={r.enabled} onChange={(enabled) => d.set({ enabled })} />
        </SettingRow>
        <SettingRow label="Cover address" help={<>{"{isbn}"} is replaced by the title&apos;s ISBN-13. Default: the Firebrand (TMM) cover address used by the Abrams Title app.</>} changed={r.urlTemplate !== saved.urlTemplate} stacked>
          <Input value={r.urlTemplate} onChange={(e) => d.set({ urlTemplate: e.target.value })} maxLength={400} className="font-mono text-[12px]" />
          {r.urlTemplate && !r.urlTemplate.includes("{isbn}") ? <p className="text-[12px] text-warn">The address must contain {"{isbn}"}.</p> : null}
        </SettingRow>
        <SettingRow label="Try it" help="Enter an ISBN to preview its cover with the address above." stacked>
          <div className="flex items-start gap-4">
            <Input value={isbn} onChange={(e) => setIsbn(e.target.value.trim())} className="w-48" />
            <div className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-muted">{url ?? "—"}</div>
          </div>
        </SettingRow>
        <div className="px-5 pb-4">
          <PreviewCover template={r.urlTemplate} enabled={r.enabled} isbn={isbn} />
        </div>
      </Section>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} />
    </>
  );
}

/** Preview with the unsaved address (the live component reads the saved settings). */
function PreviewCover({ template, enabled, isbn }: { template: string; enabled: boolean; isbn: string }) {
  const [status, setStatus] = useState<{ key: string; state: "loading" | "ok" | "broken" }>({ key: "", state: "loading" });
  const src = enabled ? coverUrl(template, isbn) : null;
  const key = src ?? "";
  if (status.key !== key) setStatus({ key, state: "loading" });
  if (!src) return <TitleCoverFallbackNote text={enabled ? "The address needs {isbn}." : "Covers are off."} />;
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-[188px] w-[132px] items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- external cover host */}
        <img
          key={src}
          src={src}
          alt="Cover preview"
          referrerPolicy="no-referrer"
          className={status.state === "broken" ? "hidden" : "size-full object-contain"}
          onLoad={(e) => setStatus({ key, state: e.currentTarget.naturalWidth > 10 ? "ok" : "broken" })}
          onError={() => setStatus({ key, state: "broken" })}
        />
        {status.state === "broken" ? <span className="px-2 text-center text-[11px] text-muted">No cover — the fallback panel is shown</span> : null}
      </div>
      <span className="text-[12.5px] text-muted">{status.state === "ok" ? "Cover found." : status.state === "broken" ? "No image at this address for that ISBN." : "Loading…"}</span>
    </div>
  );
}

function TitleCoverFallbackNote({ text }: { text: string }) {
  return <p className="text-[12.5px] text-muted">{text}</p>;
}

/* ---------------- Health ---------------- */

type Health = Awaited<ReturnType<typeof health>>;

export function HealthPage() {
  const h = useAdmin<Health>("health", { refetchInterval: 60_000 });
  const x = h.data;
  const checkRow = (label: string, c: { ok: boolean; ms: number; error?: string | null }, slow: number) => (
    <tr>
      <td className="flex items-center gap-2">
        <StatusDot ok={c.ok} warn={c.ok && c.ms > slow} />
        {label}
      </td>
      <td className="num">{c.ok ? `${fmtInt(c.ms)} ms` : "—"}</td>
      <td className="text-xs">{c.ok ? (c.ms > slow ? <span className="text-warn">Slow</span> : <span className="text-ok">OK</span>) : <span className="text-brand">{c.error ?? "Failed"}</span>}</td>
    </tr>
  );
  return (
    <>
      <PageHeader
        icon={HeartPulse}
        title="Health"
        description="Which version is running where, and whether the database and BigQuery answer quickly."
        actions={
          <Button onClick={() => void h.refetch()} disabled={h.isFetching}>
            {h.isFetching ? <Spinner className="size-3.5" /> : <RefreshCcw />}
            Check again
          </Button>
        }
      />
      {!x ? (
        <Loading rows={6} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Environment" value={<span className="capitalize">{x.environment}</span>} sub={x.region ? `Region ${x.region}` : undefined} />
            <Stat label="Version" value={x.version} sub={x.commit ? `${x.branch ?? ""} · ${x.commit}` : "local build"} />
            <Stat label="Database" value={x.checks.mongo.ok ? "Connected" : "Down"} tone={x.checks.mongo.ok ? "ok" : "brand"} sub={x.database} />
            <Stat label="BigQuery" value={x.checks.bigQuery.ok ? "Connected" : "Unavailable"} tone={x.checks.bigQuery.ok ? "ok" : "warn"} sub={x.bigQuery.project ?? "not configured"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Response times" description={<>Checked <When iso={x.checkedAt} /></>}>
              <Table head={["Check", "Time", "Status"]}>
                {checkRow("Database ping", x.checks.mongo, 150)}
                {checkRow("Title count (summary)", x.checks.summaryQuery, 300)}
                {checkRow("Title detail rows", x.checks.titleQuery, 300)}
                {checkRow("BigQuery query", x.checks.bigQuery, 4000)}
              </Table>
            </Section>
            <Section title="Configuration">
              <Table head={["Setting", "Value"]}>
                <tr>
                  <td>Sign-in</td>
                  <td>{x.signIn}</td>
                </tr>
                <tr>
                  <td>Write-back to BigQuery</td>
                  <td>{x.writeback === "none" ? "Off (preview)" : "On"}</td>
                </tr>
                <tr>
                  <td>BigQuery datasets</td>
                  <td className="text-xs">
                    source {x.bigQuery.source} · app {x.bigQuery.app}
                  </td>
                </tr>
                <tr>
                  <td>Runtime</td>
                  <td className="text-xs">Node {x.node}</td>
                </tr>
              </Table>
            </Section>
          </div>
          <Section title="Stored records">
            <Table head={["Collection", "Records"]}>
              {Object.entries(x.counts).map(([k, v]) => (
                <tr key={k}>
                  <td className="num text-xs">{k}</td>
                  <td className="num">{fmtInt(v as number)}</td>
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
