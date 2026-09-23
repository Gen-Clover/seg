"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CloudOff,
  Copy,
  Eye,
  Search,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  accountKey,
  buildTitleGrid,
  isAccountLevelChannel,
  titleTotals,
  type AccountFact,
  type AccountRef,
  type EstimateField,
  type EstimateRecord,
} from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Kbd, Skeleton, Spinner, Textarea } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { queryKeys, usePrefetchTitle, useSummary, useTitle, type TitleDetail } from "@/lib/queries";
import { cn, fmtDate, fmtInt, fmtMoney, fmtSigned, timeAgo } from "@/lib/utils";
import { useWorklist } from "@/lib/worklist";
import { AddAccountDialog } from "./add-account-dialog";
import { CompPanel } from "./comp-panel";
import { EstimatesGrid, type EstimatesGridHandle } from "./estimates-grid";
import { HistoryPanel } from "./history-panel";
import { allExpandableKeys, rowLevel, rowRef, type GridRow } from "./grid-model";
import { useAutosave, type SaveStatus } from "./use-autosave";

export function TitleView({ isbn, canEdit }: { isbn: string; canEdit: boolean }) {
  const detail = useTitle(isbn);
  const qc = useQueryClient();
  const autosave = useAutosave(isbn, canEdit);
  const gridRef = useRef<EstimatesGridHandle>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [draftAccounts, setDraftAccounts] = useState<AccountRef[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);

  const data = detail.data;
  const grid = useMemo(() => {
    if (!data) return null;
    const estimates = autosave.applyEdits(data.estimates as EstimateRecord[]);
    const drafts: AccountFact[] = draftAccounts.map((r) => ({ ...r, initialOrder: 0 }));
    return buildTitleGrid({ facts: [...data.facts, ...drafts], compFacts: data.compFacts, estimates });
  }, [data, autosave, draftAccounts]);
  const totals = useMemo(() => (grid ? titleTotals(grid) : null), [grid]);

  const plan = useMutation({
    mutationFn: (change: { compIsbn?: string | null; titleNotes?: string }) =>
      api(`/api/titles/${encodeURIComponent(isbn)}/plan`, { method: "PATCH", json: change }),
    onSuccess: async (_r, change) => {
      if (change.compIsbn !== undefined) {
        await qc.invalidateQueries({ queryKey: queryKeys.title(isbn) });
        qc.setQueryData<{ titles: { isbn: string; compIsbn: string | null }[] }>(queryKeys.summary, (old) =>
          old ? { ...old, titles: old.titles.map((t) => (t.isbn === isbn ? { ...t, compIsbn: change.compIsbn ?? null } : t)) } : old,
        );
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save."),
  });

  const onEdit = useCallback(
    (row: GridRow, field: EstimateField, value: number | string | null) => {
      const level = rowLevel(row);
      const ref = rowRef(row);
      if (level && ref) autosave.edit(level, ref, field, value);
    },
    [autosave],
  );

  const toggle = useCallback((key: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  const addAccount = (ref: AccountRef) => {
    if (!grid) return;
    const key = accountKey(ref);
    const channel = grid.channels.find((c) => c.orgs.some((o) => o.accounts.some((a) => a.key === key)));
    const accountLevel = isAccountLevelChannel(ref.channelId);
    if (!channel) setDraftAccounts((d) => [...d, ref]);
    // Expand the path and focus the row once it renders.
    setTimeout(() => {
      const g = gridRef.current;
      const ch = grid.channels.find((c) => c.ref.channelId === ref.channelId && c.ref.channelName === ref.channelName);
      const org = ch?.orgs.find((o) => o.ref.orgId === ref.orgId && o.ref.orgName === ref.orgName);
      setExpanded((s) => {
        const n = new Set(s);
        if (ch) n.add(ch.key);
        else n.add(`${ref.channelId ?? ""}\u001e${ref.channelName ?? ref.channelId ?? ""}`);
        if (org && accountLevel) n.add(org.key);
        return n;
      });
      setFilter("");
      setTimeout(() => {
        const target = accountLevel ? key : org?.key ?? key;
        g?.focusRow(target);
        setHighlight(target);
        setTimeout(() => setHighlight(null), 1600);
      }, 60);
    }, 0);
    if (channel) toast.info("That account is already on this title — jumped to it.");
    else if (!accountLevel) toast.info("This channel is planned at organization level — enter values on the organization row.");
    else toast.success("Account added. Type a value to save it.");
  };

  if (detail.isError) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <Card className="max-w-md p-8 text-center">
          <AlertCircle className="mx-auto size-8 text-brand" />
          <p className="mt-3 font-medium">{detail.error instanceof Error ? detail.error.message : "This title could not be loaded."}</p>
          <Button asChild className="mt-4">
            <Link href="/">Back to summary</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <TopBar isbn={isbn} status={autosave.status} lastSavedAt={autosave.lastSavedAt} canEdit={canEdit} />
      {!data || !grid || !totals ? (
        <TitleSkeleton />
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-6 lg:px-6">
          <TitleHeader data={data} totals={totals} />
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <DetailsCard data={data} canEdit={canEdit} onNotes={(titleNotes) => plan.mutate({ titleNotes })} />
            <CompPanel
              isbn={isbn}
              comp={data.comp}
              canEdit={canEdit}
              saving={plan.isPending && plan.variables?.compIsbn !== undefined}
              onChange={(compIsbn) => plan.mutate({ compIsbn })}
            />
          </div>

          <Card className="flex h-[calc(100vh-96px)] min-h-[480px] flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
                <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find channel, organization or account" className="pl-8 pr-7" />
                {filter ? (
                  <button type="button" onClick={() => setFilter("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink" aria-label="Clear filter">
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set(allExpandableKeys(grid)))}>
                <ChevronsUpDown />
                Expand all
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setExpanded(new Set())}>
                <ChevronsDownUp />
                Collapse all
              </Button>
              <div className="ml-auto flex items-center gap-3">
                <Legend />
                {canEdit ? <AddAccountDialog onPick={addAccount} /> : null}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <EstimatesGrid
                ref={gridRef}
                isbn={isbn}
                grid={grid}
                expanded={expanded}
                onToggle={toggle}
                filter={filter}
                canEdit={canEdit}
                dirtyCells={autosave.dirtyCells}
                savedCells={autosave.savedCells}
                onEdit={onEdit}
                highlightKey={highlight}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden items-center gap-3 text-[11px] text-muted lg:flex">
      <span className="flex items-center gap-1">
        <span className="num italic text-subtle">1,240</span> total of rows below
      </span>
      <span className="flex items-center gap-1">
        <span className="size-1.5 rounded-full bg-info" /> overrides rows below
      </span>
      <span className="flex items-center gap-1">
        <Kbd>Enter</Kbd> edit · <Kbd>Ctrl V</Kbd> paste from Excel
      </span>
    </div>
  );
}

function TopBar({ isbn, status, lastSavedAt, canEdit }: { isbn: string; status: SaveStatus; lastSavedAt: number | null; canEdit: boolean }) {
  const router = useRouter();
  const worklist = useWorklist();
  const summary = useSummary();
  const prefetch = usePrefetchTitle();

  const list = useMemo(() => {
    if (worklist?.isbns.includes(isbn)) return worklist;
    const all = [...(summary.data?.titles ?? [])].sort((a, b) => (a.pubDate ?? "").localeCompare(b.pubDate ?? "") || a.isbn.localeCompare(b.isbn));
    return { isbns: all.map((t) => t.isbn), label: "All titles", href: "/" };
  }, [worklist, isbn, summary.data]);

  const idx = list.isbns.indexOf(isbn);
  const prev = idx > 0 ? list.isbns[idx - 1] : undefined;
  const next = idx >= 0 && idx < list.isbns.length - 1 ? list.isbns[idx + 1] : undefined;

  useEffect(() => {
    const t = setTimeout(() => {
      prefetch(next);
      prefetch(prev);
    }, 250);
    return () => clearTimeout(t);
  }, [next, prev, prefetch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.push(`/titles/${next}`);
      } else if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.push(`/titles/${prev}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, router]);

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-canvas/85 px-5 backdrop-blur lg:px-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted">
        <Link href={list.href}>
          <ArrowLeft />
          {list.label}
        </Link>
      </Button>
      <div className="flex items-center gap-1">
        <Tooltip content={prev ? "Previous title (Alt ←)" : null}>
          <Button asChild={!!prev} variant="outline" size="icon-sm" disabled={!prev} aria-label="Previous title">
            {prev ? (
              <Link href={`/titles/${prev}`}>
                <ChevronLeft />
              </Link>
            ) : (
              <ChevronLeft />
            )}
          </Button>
        </Tooltip>
        <span className="num min-w-[76px] text-center text-xs text-muted">
          {idx >= 0 ? `${fmtInt(idx + 1)} of ${fmtInt(list.isbns.length)}` : ""}
        </span>
        <Tooltip content={next ? "Next title (Alt →)" : null}>
          <Button asChild={!!next} variant="outline" size="icon-sm" disabled={!next} aria-label="Next title">
            {next ? (
              <Link href={`/titles/${next}`}>
                <ChevronRight />
              </Link>
            ) : (
              <ChevronRight />
            )}
          </Button>
        </Tooltip>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <HistoryPanel isbn={isbn} />
        {canEdit ? <SaveIndicator status={status} lastSavedAt={lastSavedAt} /> : <ReadOnlyBadge />}
      </div>
    </div>
  );
}

function ReadOnlyBadge() {
  return (
    <Badge className="gap-1.5 py-1">
      <Eye className="size-3.5" />
      View only
    </Badge>
  );
}

function SaveIndicator({ status, lastSavedAt }: { status: SaveStatus; lastSavedAt: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  if (status === "saving" || status === "pending")
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Spinner className="size-3.5" /> Saving…
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1.5 text-xs text-warn">
        <CloudOff className="size-3.5" /> Offline — retrying
      </span>
    );
  if (status === "saved" && lastSavedAt)
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Check className="size-3.5 text-ok" /> Saved {timeAgo(new Date(lastSavedAt).toISOString())}
      </span>
    );
  return <span className="text-xs text-subtle">Changes save automatically</span>;
}

function TitleHeader({ data, totals }: { data: TitleDetail; totals: ReturnType<typeof titleTotals> }) {
  const t = data.title;
  const gap = totals.estimateVsGoal;
  const copy = () => {
    void navigator.clipboard?.writeText(t.isbn);
    toast.success("ISBN copied");
  };
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {t.season ? <Badge tone="brand">{t.season}</Badge> : null}
            {t.format ? <Badge>{t.format}</Badge> : null}
            {t.division ? <Badge>{t.division}</Badge> : null}
            {!t.inScope ? <Badge tone="warn">Not in SEG scope</Badge> : null}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span>{t.author ?? "Unknown author"}</span>
            <span className="text-line-strong">•</span>
            <button type="button" onClick={copy} className="num group inline-flex items-center gap-1 hover:text-ink">
              {t.isbn}
              <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
            <span className="text-line-strong">•</span>
            <span>{t.imprint}</span>
            {t.plan.updatedAt ? (
              <>
                <span className="text-line-strong">•</span>
                <span>
                  Updated {timeAgo(t.plan.updatedAt)}
                  {t.plan.updatedBy ? ` by ${t.plan.updatedBy.split("@")[0]}` : ""}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Initial orders" value={fmtInt(totals.initialOrder)} hint="Pre-publication, all accounts" />
        <Kpi label="Laydown goal" value={fmtInt(totals.laydownGoal)} />
        <Kpi label="Laydown estimate" value={fmtInt(totals.laydownEstimate)} hint={totals.laydownGoal ? `${Math.round(((totals.laydownEstimate ?? 0) / totals.laydownGoal) * 100)}% of goal` : undefined} />
        <Kpi label="6-month estimate" value={fmtInt(totals.sixMonthEstimate)} hint="Including laydown" />
        <Kpi
          label="Goal vs estimate"
          value={fmtSigned(gap)}
          tone={gap === null ? undefined : gap > 0 ? "text-warn" : gap < 0 ? "text-ok" : undefined}
          hint={gap === null ? "No estimates yet" : gap > 0 ? "Estimate below goal" : gap < 0 ? "Estimate above goal" : "On goal"}
        />
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn("num mt-1 text-[22px] font-semibold tracking-tight transition-colors", tone)}>{value}</div>
      <div className="truncate text-xs text-subtle">{hint ?? " "}</div>
    </Card>
  );
}

function DetailsCard({ data, canEdit, onNotes }: { data: TitleDetail; canEdit: boolean; onNotes: (notes: string) => void }) {
  const t = data.title;
  const [notes, setNotes] = useState(t.plan.titleNotes);
  const saved = useRef(t.plan.titleNotes);
  useEffect(() => {
    if (notes === saved.current) return;
    const timer = setTimeout(() => {
      saved.current = notes;
      onNotes(notes);
    }, 900);
    return () => clearTimeout(timer);
  }, [notes, onNotes]);

  const items: [string, string][] = [
    ["Pub date", fmtDate(t.pubDate)],
    ["Release date", fmtDate(t.releaseDate)],
    ["Paper cut-off", fmtDate(t.paperCutOff)],
    ["LDC", fmtDate(t.ldc)],
    ["US price", fmtMoney(t.usPrice)],
    ["Pages", fmtInt(t.pages)],
    ["Trim", t.trim ?? "—"],
    ["Print run", fmtInt(t.printRun)],
    ["1st printing (AFPt)", fmtInt(t.announcedPrinting)],
    ["eBook ISBN", t.ebookIsbn ?? "—"],
    ["LTD sales", fmtInt(t.stats.ltdGrossUnits)],
    ["eBook sales", fmtInt(t.stats.ebookUnits)],
  ];
  return (
    <Card className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <h3 className="mb-2.5 text-[13px] font-semibold">Title details</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
          {items.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-xs text-muted">{k}</dt>
              <dd className="num truncate text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {t.competitiveTitles.length ? (
          <p className="mt-3 truncate text-xs text-muted">
            Competitive titles: <span className="num text-ink-2">{t.competitiveTitles.join(", ")}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col">
        <label htmlFor="title-notes" className="mb-2.5 text-[13px] font-semibold">
          Title notes
        </label>
        <Textarea
          id="title-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          readOnly={!canEdit}
          placeholder={canEdit ? "Notes for the whole title — saved automatically" : "No notes"}
          className="min-h-28 flex-1"
        />
      </div>
    </Card>
  );
}

function TitleSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-5 pt-4 lg:px-6">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-96" />
      <div className="grid grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
