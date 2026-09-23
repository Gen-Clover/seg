"use client";

import { Building2, CalendarClock, Eye, Lock, LockOpen, Play, Scale, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Spinner, Textarea } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { useTitleSearch } from "@/lib/queries";
import { cn, fmtInt } from "@/lib/utils";
import type { runBulk } from "@/server/services/admin/bulk";
import type { accountCatalog, ruleImpact, ruleOptions } from "@/server/services/admin/system";
import {
  CheckboxGroup,
  FixedRule,
  LastSaved,
  Loading,
  NumberField,
  PageHeader,
  SaveBar,
  Section,
  SelectField,
  SettingRow,
  Switch,
  Table,
  TagInput,
  When,
  useAdmin,
  useAdminAction,
  useSectionDraft,
  useSettingsData,
  type AppSettings,
} from "./ui";

type Options = Awaited<ReturnType<typeof ruleOptions>>;
type Impact = Awaited<ReturnType<typeof ruleImpact>>;
type Rules = AppSettings["rules"];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Checkbox options: values from the data (with counts) plus any configured value that isn't in the data. */
function withCurrent(fromData: { value: string; count?: number }[], current: string[]) {
  const seen = new Set(fromData.map((o) => o.value.toUpperCase()));
  return [
    ...fromData.map((o) => ({ value: o.value, hint: o.count !== undefined ? `${fmtInt(o.count)} titles` : undefined })),
    ...current.filter((c) => !seen.has(c.toUpperCase())).map((c) => ({ value: c, hint: "not in the data" })),
  ];
}

/* ---------------- Business rules ---------------- */

export function RulesPage() {
  const d = useSectionDraft("rules");
  const options = useAdmin<Options>("rules/options");
  const [impact, setImpact] = useState<Impact | null>(null);
  const [applying, setApplying] = useState(false);
  const preview = useAdminAction((rules: Rules) => api<Impact>("/api/admin/rules/impact", { method: "POST", json: rules }));
  const saved = d.data?.settings.rules;
  const r = d.draft;
  const o = options.data;

  const saveAndApply = async () => {
    if (!r || !saved) return;
    const scopeChanged = (Object.keys(r) as (keyof Rules)[]).some(
      (k) => !["compExcludedIpmFormats", "compExcludedFormatWords", "salesNoteMaxLength", "titleNoteMaxLength"].includes(k) && !same(r[k], saved[k]),
    );
    try {
      await d.save();
    } catch {
      return;
    }
    setImpact(null);
    if (!scopeChanged) return;
    setApplying(true);
    const id = toast.loading("Applying the new rules to every title…");
    try {
      const res = await api<{ mode: string; inScope: number; changed: number }>("/api/admin/rules/apply", { method: "POST" });
      toast.success(`Rules applied · ${fmtInt(res.inScope)} titles in scope${res.mode === "full-refresh" ? " (full data refresh)" : ""}`, { id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Applying the rules failed — run it again from Data refresh.", { id });
    } finally {
      setApplying(false);
    }
  };

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    const list = new Set<number>([...(o?.seasonYears ?? []), ...Array.from({ length: 8 }, (_, i) => now - 5 + i), r?.minSeasonYear ?? now]);
    return [...list].sort();
  }, [o, r?.minSeasonYear]);

  if (!r || !saved) return <Loading rows={8} />;
  const ch = (k: keyof Rules) => !same(r[k], saved[k]);

  return (
    <>
      <PageHeader
        icon={Scale}
        title="Business rules"
        description="The rules SEG works by. Every default is the rule the original SEG used — nothing changes until you change it here. Saving applies the rules to every title (and re-reads BigQuery when the first season changes)."
        actions={<LastSaved meta={d.data?.meta} />}
      />

      <Section title="Which titles are in SEG" description="A title is shown when it passes every rule below.">
        <SettingRow label="First season in scope" help="Titles from earlier seasons are left out. Changing this re-reads titles from BigQuery." changed={ch("minSeasonYear")}>
          <SelectField label="First season year" value={r.minSeasonYear} onChange={(minSeasonYear) => d.set({ minSeasonYear })} options={years.map((y) => ({ value: y, label: `${y} and later` }))} />
        </SettingRow>
        <SettingRow label="Seasons in scope" help="Original SEG: Spring and Fall only." changed={ch("seasonNames")} stacked>
          <CheckboxGroup options={(o?.seasonNames ?? r.seasonNames).map((s) => ({ value: s }))} value={r.seasonNames} onChange={(seasonNames) => d.set({ seasonNames })} />
        </SettingRow>
        <SettingRow label="Formats in scope (IPM format)" help="Original SEG: HC (hardcover), PB (paperback) and BB (board book). Counts are titles in the catalog." changed={ch("includedIpmFormats")} stacked>
          <CheckboxGroup options={withCurrent(o?.ipmFormats ?? [], r.includedIpmFormats)} value={r.includedIpmFormats} onChange={(includedIpmFormats) => d.set({ includedIpmFormats })} />
        </SettingRow>
        <SettingRow label="Excluded formats" help="Titles whose FORMAT is exactly one of these are left out. Original SEG: ARC and Catalog." changed={ch("excludedFormats")} stacked>
          <CheckboxGroup options={withCurrent(o?.formats ?? [], r.excludedFormats)} value={r.excludedFormats} onChange={(excludedFormats) => d.set({ excludedFormats })} />
        </SettingRow>
        <SettingRow label="Excluded when the format contains" help="Any FORMAT containing one of these words is left out (not case-sensitive). Original SEG: Display." changed={ch("excludedFormatWords")} stacked>
          <TagInput value={r.excludedFormatWords} onChange={(excludedFormatWords) => d.set({ excludedFormatWords })} placeholder="Type a word and press Enter" />
        </SettingRow>
        <SettingRow label="A title needs a division" help="Original SEG: yes — titles without a division are left out." changed={ch("requireDivision")}>
          <Switch label="A title needs a division" checked={r.requireDivision} onChange={(requireDivision) => d.set({ requireDivision })} />
        </SettingRow>
        <SettingRow label="A title needs an imprint" help="Original SEG: yes — titles without an imprint are left out." changed={ch("requireImprint")}>
          <Switch label="A title needs an imprint" checked={r.requireImprint} onChange={(requireImprint) => d.set({ requireImprint })} />
        </SettingRow>
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-surface-2/40 px-5 py-3">
          <Button size="sm" onClick={() => preview.mutate(r, { onSuccess: setImpact })} disabled={preview.isPending}>
            {preview.isPending ? <Spinner className="size-3.5" /> : <Eye />}
            Preview the effect
          </Button>
          {impact ? (
            <span className="text-[13px]" data-testid="rules-impact">
              <span className="num font-semibold">{fmtInt(impact.inScopeNow)}</span> titles in scope now →{" "}
              <span className="num font-semibold">{fmtInt(impact.inScopeAfter)}</span> after
              {impact.added ? <Badge tone="ok" className="ml-2">+{fmtInt(impact.added)}</Badge> : null}
              {impact.removed ? <Badge tone="warn" className="ml-1">−{fmtInt(impact.removed)}</Badge> : null}
              {impact.needsFullRefresh ? <span className="ml-2 text-muted">(first season changed: titles are re-read from BigQuery, so the final count may differ)</span> : null}
            </span>
          ) : (
            <span className="text-[12.5px] text-muted">See how many titles would be in or out before saving.</span>
          )}
        </div>
      </Section>

      <Section title="Account-level channels" description="In these channels, organizations open up to individual accounts on the grid. In every other channel, organizations are the lowest level.">
        <SettingRow label="Channels with accounts" help="Original SEG: MASSMER and RETINDEP." changed={ch("accountLevelChannels")} stacked>
          <CheckboxGroup
            columns={2}
            options={[
              ...(o?.channels ?? []).map((c) => ({ value: c.value, label: c.label })),
              ...r.accountLevelChannels.filter((c) => !(o?.channels ?? []).some((x) => x.value.toUpperCase() === c.toUpperCase())).map((c) => ({ value: c, hint: "not in the data" })),
            ]}
            value={r.accountLevelChannels}
            onChange={(accountLevelChannels) => d.set({ accountLevelChannels })}
          />
        </SettingRow>
      </Section>

      <Section title="Comparable titles" description="What the comparable-title search leaves out.">
        <SettingRow label="Formats left out of the search" help="Original SEG: EB (eBooks)." changed={ch("compExcludedIpmFormats")} stacked>
          <CheckboxGroup options={withCurrent(o?.ipmFormats ?? [], r.compExcludedIpmFormats)} value={r.compExcludedIpmFormats} onChange={(compExcludedIpmFormats) => d.set({ compExcludedIpmFormats })} />
        </SettingRow>
        <SettingRow label="Left out when the format contains" help="Original SEG: catalog and display." changed={ch("compExcludedFormatWords")} stacked>
          <TagInput value={r.compExcludedFormatWords} onChange={(compExcludedFormatWords) => d.set({ compExcludedFormatWords })} placeholder="Type a word and press Enter" />
        </SettingRow>
      </Section>

      <Section title="Notes">
        <SettingRow label="Sales note length" help="Longest note on a channel, organization or account row. Original SEG: 2,000 characters." changed={ch("salesNoteMaxLength")}>
          <NumberField value={r.salesNoteMaxLength} onChange={(salesNoteMaxLength) => d.set({ salesNoteMaxLength })} min={50} max={10000} suffix="characters" />
        </SettingRow>
        <SettingRow label="Title note length" help="Longest note for a whole title. Original SEG: 4,000 characters." changed={ch("titleNoteMaxLength")}>
          <NumberField value={r.titleNoteMaxLength} onChange={(titleNoteMaxLength) => d.set({ titleNoteMaxLength })} min={50} max={20000} suffix="characters" />
        </SettingRow>
      </Section>

      <Section title="Fixed rules" description="How SEG calculates and saves. These are part of the planning logic and are shown here for reference.">
        <FixedRule title="Totals roll up">A number typed on a channel or organization row replaces the total of its rows below; otherwise the row shows the sum of the rows below (blanks are ignored).</FixedRule>
        <FixedRule title="Zero is a value">A typed 0 is kept as 0 and counts in totals; an empty cell means “no estimate”.</FixedRule>
        <FixedRule title="Whole numbers only">Estimates are whole numbers of 0 or more; commas are allowed and decimals are rounded.</FixedRule>
        <FixedRule title="Account identity">Rows are matched by channel, organization and account (IDs and names). A missing channel shows as “Not Defined”.</FixedRule>
        <FixedRule title="Uploads">Blank cells in a spreadsheet keep the current value; unknown ISBNs or accounts are reported as errors; changes made by someone else since the export are shown as conflicts instead of being overwritten.</FixedRule>
        <FixedRule title="Comparable-title figures">The comparable columns show the comparable title’s initial orders, sales and point-of-sale for the same accounts.</FixedRule>
        <FixedRule title="History">Every change is kept with who, when, the old and the new value, and can be restored from the title’s history.</FixedRule>
      </Section>

      <SaveBar
        dirty={d.dirty}
        saving={d.saving || applying}
        onSave={() => void saveAndApply()}
        onDiscard={() => {
          d.discard();
          setImpact(null);
        }}
        note="Saving applies the new rules to every title."
      />
      <div className="h-4" />
    </>
  );
}

/* ---------------- My Desk defaults ---------------- */

export function DeskDefaultsPage() {
  const d = useSectionDraft("desk");
  const r = d.draft;
  const saved = d.data?.settings.desk;
  if (!r || !saved) return <Loading />;
  return (
    <>
      <PageHeader icon={CalendarClock} title="My Desk defaults" description="What everyone's My Desk shows when they open it. People can still pick another due-soon window for themselves." actions={<LastSaved meta={d.data?.meta} />} />
      <Section>
        <SettingRow label="Due-soon window" help="Titles publishing within this many days appear under Due soon. Original SEG: 14 days." changed={r.dueWindowDays !== saved.dueWindowDays}>
          <SelectField
            label="Due-soon window"
            value={r.dueWindowDays}
            onChange={(dueWindowDays) => d.set({ dueWindowDays })}
            options={[...new Set([7, 14, 30, r.dueWindowDays])].sort((a, b) => a - b).map((n) => ({ value: n, label: `${n} days` }))}
          />
        </SettingRow>
        <SettingRow label="Overdue look-back" help="Titles that published up to this many days ago and are still missing estimates stay on the list as overdue. Original SEG: 14 days." changed={r.overdueDays !== saved.overdueDays}>
          <NumberField value={r.overdueDays} onChange={(overdueDays) => d.set({ overdueDays })} min={0} max={365} suffix="days" />
        </SettingRow>
        <SettingRow
          label="Below-goal threshold"
          help="A title counts as below goal when its laydown estimate is short of the goal by more than this percentage. 0% means any shortfall. Original SEG: 0%."
          changed={r.belowGoalThresholdPct !== saved.belowGoalThresholdPct}
        >
          <NumberField value={r.belowGoalThresholdPct} onChange={(belowGoalThresholdPct) => d.set({ belowGoalThresholdPct })} min={0} max={100} suffix="%" />
        </SettingRow>
      </Section>
      <SaveBar dirty={d.dirty} saving={d.saving} onSave={() => void d.save()} onDiscard={d.discard} />
    </>
  );
}

/* ---------------- Locks ---------------- */

export function LocksPage() {
  const settings = useSettingsData();
  const options = useAdmin<Options>("rules/options");
  const locks = settings.data?.settings.locks ?? [];
  const [kind, setKind] = useState<"season" | "title">("season");
  const [season, setSeason] = useState("");
  const [isbnQ, setIsbnQ] = useState("");
  const [isbn, setIsbn] = useState<{ isbn: string; title: string } | null>(null);
  const [note, setNote] = useState("");
  const [unlocking, setUnlocking] = useState<(typeof locks)[number] | null>(null);
  const [reason, setReason] = useState("");
  const search = useTitleSearch(kind === "title" && !isbn ? isbnQ : "");
  const add = useAdminAction(
    (body: { kind: "season" | "title"; value: string; note: string }) => api("/api/admin/locks", { method: "POST", json: body }),
    "Locked — it's read-only for everyone now.",
  );
  const unlock = useAdminAction(({ id, reason }: { id: string; reason: string }) => api(`/api/admin/locks/${id}/unlock`, { method: "POST", json: { reason } }), "Unlocked.");
  const value = kind === "season" ? season : (isbn?.isbn ?? "");

  return (
    <>
      <PageHeader
        icon={Lock}
        title="Season and title locks"
        description="A locked season or title is read-only for everyone — admins included — until it is unlocked. People see who locked it, when, and your note."
      />
      <Section title="Lock something">
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div>
            <div className="mb-1 text-[12px] font-medium text-muted">Lock a</div>
            <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
              {(["season", "title"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)} className={cn("rounded-md px-3 py-1 font-medium capitalize", kind === k ? "bg-ink text-surface" : "text-muted hover:text-ink")}>
                  {k}
                </button>
              ))}
            </div>
          </div>
          {kind === "season" ? (
            <label className="text-[12px] font-medium text-muted">
              Season
              <SelectField
                label="Season"
                className="mt-1 block w-44"
                value={season}
                onChange={setSeason}
                options={[{ value: "", label: "Choose a season…" }, ...(options.data?.seasons ?? []).filter((s) => !locks.some((l) => l.kind === "season" && l.value === s)).map((s) => ({ value: s, label: s }))]}
              />
            </label>
          ) : (
            <div className="relative w-80">
              <div className="mb-1 text-[12px] font-medium text-muted">Title</div>
              {isbn ? (
                <div className="flex h-8 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 text-[13px]">
                  <span className="truncate">{isbn.title}</span>
                  <span className="num text-xs text-muted">{isbn.isbn}</span>
                  <button type="button" className="ml-auto text-muted hover:text-ink" onClick={() => setIsbn(null)} aria-label="Change title">
                    ×
                  </button>
                </div>
              ) : (
                <>
                  <Input value={isbnQ} onChange={(e) => setIsbnQ(e.target.value)} placeholder="Search ISBN or title" />
                  {search.data?.results.length ? (
                    <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
                      {search.data.results.slice(0, 12).map((t) => (
                        <li key={t.isbn}>
                          <button type="button" onClick={() => setIsbn({ isbn: t.isbn, title: t.title })} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
                            <span className="truncate">{t.title}</span>
                            <span className="num ml-auto text-xs text-muted">{t.isbn}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>
          )}
          <label className="min-w-[240px] flex-1 text-[12px] font-medium text-muted">
            Note shown to people (optional)
            <Input className="mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Final numbers sent to finance" maxLength={300} />
          </label>
          <Button
            variant="brand"
            disabled={!value || add.isPending}
            onClick={() =>
              add.mutate(
                { kind, value, note },
                {
                  onSuccess: () => {
                    setSeason("");
                    setIsbn(null);
                    setIsbnQ("");
                    setNote("");
                  },
                },
              )
            }
            data-testid="lock-add"
          >
            <Lock />
            Lock
          </Button>
        </div>
      </Section>
      <Section title={`Locked now · ${locks.length}`}>
        {settings.isPending ? (
          <Loading />
        ) : (
          <Table head={["What", "Note", "Locked by", "When", ""]} empty={!locks.length}>
            {locks.map((l) => (
              <tr key={l.id} data-testid={`lock-row-${l.value}`}>
                <td>
                  <Badge tone={l.kind === "season" ? "info" : "neutral"} className="mr-2 capitalize">
                    {l.kind}
                  </Badge>
                  <span className="font-medium">{l.label}</span>
                </td>
                <td className="text-ink-2">{l.note || <span className="text-subtle">—</span>}</td>
                <td>{l.lockedByName}</td>
                <td className="text-xs">
                  <When iso={l.lockedAt} />
                </td>
                <td className="text-right">
                  <Button size="sm" onClick={() => setUnlocking(l)}>
                    <LockOpen />
                    Unlock
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Dialog open={!!unlocking} onOpenChange={(o) => (o ? null : setUnlocking(null))}>
        {unlocking ? (
          <DialogContent title={`Unlock ${unlocking.label}?`} description="People can change it again straight away. The reason is kept in Admin changes.">
            <div className="px-5 py-4">
              <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it being unlocked?" maxLength={300} />
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button variant="ghost" onClick={() => setUnlocking(null)}>
                Cancel
              </Button>
              <Button
                variant="brand"
                disabled={reason.trim().length < 3 || unlock.isPending}
                onClick={() =>
                  unlock.mutate(
                    { id: unlocking.id, reason },
                    {
                      onSuccess: () => {
                        setUnlocking(null);
                        setReason("");
                      },
                    },
                  )
                }
              >
                <LockOpen />
                Unlock
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
      <div className="h-6" />
    </>
  );
}

/* ---------------- Account catalog ---------------- */

type Catalog = Awaited<ReturnType<typeof accountCatalog>>;

export function AccountsPage() {
  const [q, setQ] = useState("");
  const [channel, setChannel] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const params = new URLSearchParams({ q, page: String(page), ...(channel[0] ? { channel: channel[0] } : {}) });
  const data = useAdmin<Catalog>(`accounts?${params}`);
  const c = data.data;
  return (
    <>
      <PageHeader
        icon={Building2}
        title="Account catalog"
        description="Every valid channel, organization and account combination, as loaded from BigQuery. This is the list people pick from in “Add account”."
        actions={c ? <span className="text-xs text-subtle">Last refreshed {c.lastRefreshedAt ? <When iso={c.lastRefreshedAt} /> : "—"}</span> : null}
      />
      {c ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {c.channels.slice(0, 8).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setChannel(channel[0] === x.id ? [] : [x.id]);
                setPage(0);
              }}
              className={cn("rounded-xl border bg-surface px-4 py-3 text-left shadow-[var(--shadow-card)]", channel[0] === x.id ? "border-brand/50 ring-2 ring-brand/10" : "border-line hover:border-line-strong")}
            >
              <div className="flex items-center gap-1.5 truncate text-xs font-medium text-muted">
                {x.name ?? x.id}
                {x.accountLevel ? <Badge tone="brand">accounts</Badge> : null}
              </div>
              <div className="num mt-1 text-lg font-semibold">{fmtInt(x.accounts)}</div>
              <div className="text-xs text-subtle">{fmtInt(x.orgs)} organizations</div>
            </button>
          ))}
        </div>
      ) : null}
      <Section>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Search account, organization, channel or number"
            className="w-80"
          />
          <MultiSelect
            label="Channel"
            options={(c?.channels ?? []).map((x) => ({ value: x.id, label: x.name ?? x.id, count: x.accounts }))}
            selected={channel}
            onChange={(v) => {
              setChannel(v.slice(-1));
              setPage(0);
            }}
          />
          <span className="ml-auto text-xs text-muted">{c ? `${fmtInt(c.total)} matching` : null}</span>
        </div>
        {!c ? (
          <Loading />
        ) : (
          <Table head={["Channel", "Organization", "Account"]} empty={!c.items.length}>
            {c.items.map((a) => (
              <tr key={a._id}>
                <td>
                  {a.channelName ?? "Not Defined"} <span className="num text-xs text-subtle">{a.channelId}</span>
                </td>
                <td>
                  {a.orgName ?? "—"} <span className="num text-xs text-subtle">{a.orgId}</span>
                </td>
                <td>
                  {a.accountName ?? "—"} <span className="num text-xs text-subtle">{a.accountId}</span>
                </td>
              </tr>
            ))}
          </Table>
        )}
        {c && c.total > c.pageSize ? (
          <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2 text-xs text-muted">
            Page {page + 1} of {Math.ceil(c.total / c.pageSize)}
            <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button size="sm" disabled={(page + 1) * c.pageSize >= c.total} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        ) : null}
      </Section>
      <div className="h-6" />
    </>
  );
}

/* ---------------- Bulk actions ---------------- */

type BulkResult = Awaited<ReturnType<typeof runBulk>>;
const FIELDS = [
  { value: "laydownGoal", label: "Laydown goal" },
  { value: "laydownEstimate", label: "Laydown estimate" },
  { value: "sixMonthEstimate", label: "6-month estimate" },
  { value: "salesNotes", label: "Sales notes" },
];

export function BulkPage() {
  const options = useAdmin<Options>("rules/options");
  const history = useAdmin<{ history: { _id: string; startedAt: string; finishedAt: string | null; ok: boolean | null; by?: string; detail: Record<string, unknown>; error?: string | null }[] }>("jobs?job=bulk&limit=20");
  const [op, setOp] = useState<"clear" | "copy">("clear");
  const [scopeKind, setScopeKind] = useState<"title" | "season">("title");
  const [scopeValue, setScopeValue] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState<"fillBlanks" | "overwrite">("fillBlanks");
  const [fields, setFields] = useState<string[]>(["laydownGoal", "laydownEstimate", "sixMonthEstimate"]);
  const [result, setResult] = useState<BulkResult | null>(null);

  const body = (apply: boolean) =>
    op === "clear"
      ? { op, scope: { kind: scopeKind, value: scopeValue.trim() }, fields, apply }
      : { op, from: from.trim(), to: to.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean), fields, mode, apply };
  const run = useAdminAction((apply: boolean) => api<BulkResult>("/api/admin/bulk", { method: "POST", json: body(apply) }));
  const ready = fields.length > 0 && (op === "clear" ? !!scopeValue.trim() : !!from.trim() && !!to.trim());
  const reset = () => setResult(null);

  return (
    <>
      <PageHeader
        icon={Wand2}
        title="Bulk actions"
        description="Clear or copy estimates for many rows at once. Always previewed first; applied changes go through the normal save path, so they appear in history and can be restored. Locked titles are skipped."
      />
      <Section>
        <SettingRow label="Action">
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
            {(
              [
                ["clear", "Clear estimates"],
                ["copy", "Copy from another title"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setOp(k);
                  reset();
                }}
                className={cn("rounded-md px-3 py-1 font-medium", op === k ? "bg-ink text-surface" : "text-muted hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
        </SettingRow>
        {op === "clear" ? (
          <SettingRow label="For" help="One title (by ISBN) or every title in a season.">
            <div className="flex items-center gap-2">
              <SelectField
                label="Scope"
                value={scopeKind}
                onChange={(v) => {
                  setScopeKind(v);
                  setScopeValue("");
                  reset();
                }}
                options={[
                  { value: "title", label: "Title (ISBN)" },
                  { value: "season", label: "Season" },
                ]}
              />
              {scopeKind === "title" ? (
                <Input className="w-48" value={scopeValue} onChange={(e) => (setScopeValue(e.target.value), reset())} placeholder="ISBN" />
              ) : (
                <SelectField
                  label="Season"
                  className="w-44"
                  value={scopeValue}
                  onChange={(v) => (setScopeValue(v), reset())}
                  options={[{ value: "", label: "Choose…" }, ...(options.data?.seasons ?? []).map((s) => ({ value: s, label: s }))]}
                />
              )}
            </div>
          </SettingRow>
        ) : (
          <>
            <SettingRow label="Copy from" help="The ISBN whose estimates are copied (usually a comparable or earlier edition).">
              <Input className="w-48" value={from} onChange={(e) => (setFrom(e.target.value), reset())} placeholder="Source ISBN" />
            </SettingRow>
            <SettingRow label="Copy to" help="One or more ISBNs, separated by commas or spaces (up to 50).">
              <Input className="w-80" value={to} onChange={(e) => (setTo(e.target.value), reset())} placeholder="Target ISBNs" />
            </SettingRow>
            <SettingRow label="When the target already has a value">
              <SelectField
                label="Copy mode"
                value={mode}
                onChange={(v) => (setMode(v), reset())}
                options={[
                  { value: "fillBlanks", label: "Keep it (fill blanks only)" },
                  { value: "overwrite", label: "Replace it" },
                ]}
              />
            </SettingRow>
          </>
        )}
        <SettingRow label="Fields" stacked>
          <CheckboxGroup options={FIELDS} value={fields} onChange={(v) => (setFields(v), reset())} />
        </SettingRow>
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-2/40 px-5 py-3">
          <Button disabled={!ready || run.isPending} onClick={() => run.mutate(false, { onSuccess: setResult })} data-testid="bulk-preview">
            {run.isPending && !result ? <Spinner className="size-3.5" /> : <Eye />}
            Preview
          </Button>
          <Button
            variant="brand"
            disabled={!result?.preview || !result.totalCells || run.isPending}
            onClick={() =>
              window.confirm(`Change ${fmtInt(result?.totalCells ?? 0)} values? They can be restored from each title's history.`) &&
              run.mutate(true, {
                onSuccess: (r) => {
                  setResult(r);
                  toast.success(`Done · ${fmtInt(r.changed)} values changed${r.conflicts ? `, ${r.conflicts} skipped (changed meanwhile)` : ""}.`);
                },
              })
            }
            data-testid="bulk-apply"
          >
            <Play />
            Apply
          </Button>
          {result ? (
            <span className="text-[13px]" data-testid="bulk-summary">
              {result.preview ? (
                <>
                  <span className="num font-semibold">{fmtInt(result.totalCells)}</span> values would change across {fmtInt(result.titles.filter((t) => t.cells && !t.locked).length)} titles
                  {result.titles.some((t) => t.locked) ? <span className="text-warn"> · {result.titles.filter((t) => t.locked).length} locked (skipped)</span> : null}
                </>
              ) : (
                <>
                  Applied · <span className="num font-semibold">{fmtInt(result.changed)}</span> values changed
                </>
              )}
            </span>
          ) : null}
        </div>
        {result?.titles.length ? (
          <Table head={["Title", "ISBN", "Values", ""]} className="max-h-72 border-t border-line">
            {result.titles.map((t) => (
              <tr key={t.isbn}>
                <td className="font-medium">{t.title}</td>
                <td className="num text-xs">{t.isbn}</td>
                <td className="num">{fmtInt(t.cells)}</td>
                <td>{t.locked ? <Badge tone="warn">Locked — skipped</Badge> : !t.cells ? <span className="text-xs text-subtle">nothing to change</span> : null}</td>
              </tr>
            ))}
          </Table>
        ) : null}
      </Section>
      <Section title="Recent bulk actions">
        <Table head={["When", "By", "What", "Result"]} empty={!history.data?.history.length}>
          {(history.data?.history ?? []).map((h) => (
            <tr key={h._id}>
              <td className="text-xs">
                <When iso={h.startedAt} />
              </td>
              <td className="text-xs">{h.by}</td>
              <td className="text-xs">
                {String(h.detail.op ?? "")} · {fmtInt(Number(h.detail.titles ?? 0))} titles
              </td>
              <td className="text-xs">{h.ok ? <Badge tone="ok">{fmtInt(Number(h.detail.changed ?? 0))} changed</Badge> : h.ok === false ? <Badge tone="warn">{h.error ?? "Failed"}</Badge> : "running…"}</td>
            </tr>
          ))}
        </Table>
      </Section>
      <div className="h-6" />
    </>
  );
}
