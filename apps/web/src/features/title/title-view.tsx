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
  ExternalLink,
  Eye,
  History,
  Keyboard,
  Maximize2,
  Minimize2,
  Lock,
  MessageSquare,
  Redo2,
  Share2,
  ShieldAlert,
  Search,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  accountKey,
  buildTitleGrid,
  estimateId,
  isAccountLevelChannel,
  refForLevel,
  titleTotals,
  type AccountFact,
  type AccountRef,
  type EstimateField,
  type EstimateRecord,
  type Level,
} from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge, Card, Input, Kbd, Skeleton, Spinner, Textarea } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { initials, personColor } from "@/lib/people";
import { editBlock, useAppSettings, useDomainConfig } from "@/lib/settings";
import { TitleCover } from "./title-cover";
import type { Session } from "@/server/auth/session";
import { queryKeys, useComments, useMe, usePrefetchTitle, useSummary, useTitle, type TitleDetail } from "@/lib/queries";
import type { Viewer } from "@/server/services/live";
import { cn, fmtDate, fmtInt, fmtMoney, fmtSigned, timeAgo } from "@/lib/utils";
import { useWorklist } from "@/lib/worklist";
import { shareInAskAbrams } from "../ask-abrams/dock";
import { AddAccountDialog } from "./add-account-dialog";
import { CompPanel, CompPicker } from "./comp-panel";
import { EstimatesGrid, type EstimatesGridHandle } from "./estimates-grid";
import { ActivityPanel, type HistoryItem, type PanelTab } from "./activity-panel";
import { rowKeysOfThread, threadTarget, type ThreadTarget } from "./comments";
import { allExpandableKeys, rowLevel, rowRef, type GridRow } from "./grid-model";
import { useAutosave, type SaveStatus } from "./use-autosave";
import { useLive } from "./use-live";
import { useUndo, type UndoCell } from "./use-undo";

type CellValue = number | string | null;
const ESTIMATE_FIELDS = new Set(["laydownGoal", "laydownEstimate", "sixMonthEstimate", "salesNotes"]);
const blankOf = (field: EstimateField): CellValue => (field === "salesNotes" ? "" : null);
const refOfItem = (e: HistoryItem): AccountRef => ({
  channelId: e.channelId,
  channelName: e.channelName,
  orgId: e.orgId,
  orgName: e.orgName,
  accountId: e.accountId,
  accountName: e.accountName,
});
const FIELD_NAME: Record<string, string> = {
  laydownGoal: "Laydown goal",
  laydownEstimate: "Laydown estimate",
  sixMonthEstimate: "6-month estimate",
  salesNotes: "Sales notes",
  compIsbn: "Comparable title",
  titleNotes: "Title notes",
};

export function TitleView({ isbn, user }: { isbn: string; user: Pick<Session, "role" | "scope"> }) {
  const detail = useTitle(isbn);
  const qc = useQueryClient();
  const settings = useAppSettings();
  const config = useDomainConfig();
  const t0 = detail.data?.title;
  // Viewer role, maintenance mode, a season/title lock or division/imprint access make the title read-only.
  const block = editBlock(user, settings, { isbn, season: t0?.season ?? null, division: t0?.division ?? null, imprint: t0?.imprint ?? null });
  const canEdit = !block;
  const autosave = useAutosave(isbn, canEdit);
  const gridRef = useRef<EstimatesGridHandle>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [draftAccounts, setDraftAccounts] = useState<AccountRef[]>([]);
  const [highlight, setHighlight] = useState<string | null>(null);
  const me = useMe().data?.user ?? null;
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const live = useLive(isbn, editingCell, settings.features.liveTeamwork);
  const comments = useComments(isbn, settings.features.comments);
  const [panel, setPanel] = useState<{ open: boolean; tab: PanelTab; thread: ThreadTarget | null }>({ open: false, tab: "comments", thread: null });
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Link from a notification (?thread=<key>): open that conversation and bring its row into view.
  const searchParams = useSearchParams();
  const threadParam = searchParams.get("thread");
  const router = useRouter();
  // Full-screen grid: kept in the URL (?grid=full) so Previous / Next stay in full screen.
  const full = searchParams.get("grid") === "full";
  const setFull = useCallback(
    (on: boolean) => router.replace(`/titles/${encodeURIComponent(isbn)}${on ? "?grid=full" : ""}`, { scroll: false }),
    [router, isbn],
  );
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [data-radix-popper-content-wrapper]")) return;
      setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, setFull]);
  const [seenThreadParam, setSeenThreadParam] = useState<string | null>(null);
  if (threadParam !== seenThreadParam) {
    setSeenThreadParam(threadParam);
    if (threadParam) {
      const target = threadTarget(isbn, threadParam);
      setPanel({ open: true, tab: "comments", thread: target });
      if (target.level !== "title") {
        const keys = rowKeysOfThread(threadParam);
        setExpanded((prev) => new Set([...prev, ...keys.parents]));
        setFocusKey(keys.row);
      }
    }
  }

  const data = detail.data;
  const { applyEdits, edit } = autosave;
  const estimates = useMemo(() => (data ? applyEdits(data.estimates as EstimateRecord[]) : []), [data, applyEdits]);
  const grid = useMemo(() => {
    if (!data) return null;
    const drafts: AccountFact[] = draftAccounts.map((r) => ({ ...r, initialOrder: 0 }));
    return buildTitleGrid({ facts: [...data.facts, ...drafts], compFacts: data.compFacts, estimates, config });
  }, [data, estimates, draftAccounts, config]);
  const totals = useMemo(() => (grid ? titleTotals(grid) : null), [grid]);

  const focusedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey || !grid || focusedRef.current === focusKey) return;
    const t = setTimeout(() => {
      focusedRef.current = focusKey;
      gridRef.current?.focusRow(focusKey);
    }, 60);
    return () => clearTimeout(t);
  }, [focusKey, grid]);

  /** A cell's own value as shown (saved value plus unsent local edits). */
  const byId = useMemo(() => new Map(estimates.map((e) => [estimateId(e.isbn, e.level, e), e])), [estimates]);
  const currentOwn = useCallback(
    (level: Level, ref: AccountRef, field: EstimateField): CellValue => {
      const rec = byId.get(estimateId(isbn, level, refForLevel(level, ref)));
      return rec ? (rec[field] ?? blankOf(field)) : blankOf(field);
    },
    [byId, isbn],
  );

  // Undo / redo: every grid edit is recorded; undoing replays earlier values as normal edits.
  const replay = useCallback((cell: UndoCell, value: CellValue) => edit(cell.level, cell.ref, cell.field, value), [edit]);
  const { record, undo, redo, canUndo, canRedo } = useUndo(replay);
  const change = useCallback(
    (level: Level, ref: AccountRef, field: EstimateField, value: CellValue, source: "grid" | "restore" = "grid") => {
      const r = refForLevel(level, ref);
      record({ level, ref: r, field, before: currentOwn(level, r, field), after: value });
      edit(level, r, field, value, source);
    },
    [record, edit, currentOwn],
  );
  const runUndo = useCallback(
    (kind: "undo" | "redo") => {
      const n = kind === "undo" ? undo() : redo();
      if (n) toast(`${kind === "undo" ? "Undid" : "Redid"} ${n} change${n === 1 ? "" : "s"}`, { id: "undo" });
    },
    [undo, redo],
  );
  useEffect(() => {
    if (!canEdit) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = key === "y" || (key === "z" && e.shiftKey);
      if (!isUndo && !isRedo) return;
      // Typing fields and dialogs keep their own undo.
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      e.preventDefault();
      runUndo(isUndo ? "undo" : "redo");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canEdit, runUndo]);

  const commentCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of comments.data?.comments ?? []) m.set(c.threadKey, (m.get(c.threadKey) ?? 0) + 1);
    return m;
  }, [comments.data]);
  const othersEditing = useMemo(() => {
    const m = new Map<string, { name: string; initials: string; color: string }>();
    for (const v of live.viewers) if (v.cell) m.set(v.cell, { name: v.name, initials: initials(v.name, v.email), color: personColor(v.email) });
    return m;
  }, [live.viewers]);
  const openThread = useCallback((key: string) => setPanel({ open: true, tab: "comments", thread: threadTarget(isbn, key) }), [isbn]);

  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const plan = useMutation({
    mutationFn: (change: { compIsbn?: string | null; titleNotes?: string }) =>
      api(`/api/titles/${encodeURIComponent(isbn)}/plan`, { method: "PATCH", json: change }),
    onSuccess: async (_r, change) => {
      if (change.titleNotes !== undefined) setNotesSavedAt(Date.now());
      if (change.compIsbn !== undefined) {
        await qc.invalidateQueries({ queryKey: queryKeys.title(isbn) });
        qc.setQueryData<{ titles: { isbn: string; compIsbn: string | null }[] }>(queryKeys.summary, (old) =>
          old ? { ...old, titles: old.titles.map((t) => (t.isbn === isbn ? { ...t, compIsbn: change.compIsbn ?? null } : t)) } : old,
        );
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save."),
  });

  /** Change or remove the comparable title (removal offers Undo). */
  const changeComp = (compIsbn: string | null) => {
    const previous = detail.data?.comp ?? null;
    plan.mutate({ compIsbn });
    if (compIsbn === null && previous) {
      toast(`Comparable title removed: ${previous.title}`, {
        duration: 8000,
        action: { label: "Undo", onClick: () => plan.mutate({ compIsbn: previous.isbn }) },
      });
    }
  };

  const onEdit = useCallback(
    (row: GridRow, field: EstimateField, value: number | string | null) => {
      const level = rowLevel(row);
      const ref = rowRef(row);
      if (level && ref) change(level, ref, field, value);
    },
    [change],
  );

  /** What a history entry's cell holds now (undefined = not restorable). */
  const currentValue = (item: HistoryItem): CellValue | undefined => {
    if (!data) return undefined;
    if (item.level === "title") {
      if (item.field === "compIsbn") return data.title.plan.compIsbn;
      if (item.field === "titleNotes") return data.title.plan.titleNotes;
      return undefined;
    }
    if (!ESTIMATE_FIELDS.has(item.field)) return undefined;
    return currentOwn(item.level, refOfItem(item), item.field as EstimateField);
  };
  const restore = (item: HistoryItem) => {
    if (item.level === "title") {
      if (item.field === "compIsbn") plan.mutate({ compIsbn: item.oldValue === null ? null : String(item.oldValue) });
      else plan.mutate({ titleNotes: String(item.oldValue ?? "") });
    } else {
      change(item.level, refOfItem(item), item.field as EstimateField, item.oldValue, "restore");
    }
    toast.success(`${FIELD_NAME[item.field] ?? item.field} restored to ${item.oldValue === null || item.oldValue === "" ? "blank" : typeof item.oldValue === "number" ? fmtInt(item.oldValue) : item.oldValue}`);
  };
  const showRow = (t: ThreadTarget) => {
    if (t.level === "title") return;
    setPanel((prev) => ({ ...prev, open: false }));
    const keys = rowKeysOfThread(t.threadKey);
    setExpanded((prev) => new Set([...prev, ...keys.parents]));
    setFilter("");
    setTimeout(() => {
      gridRef.current?.focusRow(keys.row);
      setHighlight(keys.row);
      setTimeout(() => setHighlight(null), 1600);
    }, 80);
  };

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
    const accountLevel = isAccountLevelChannel(ref.channelId, config);
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
            <Link href="/summary">Back to summary</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <TopBar
        isbn={isbn}
        status={autosave.status}
        lastSavedAt={autosave.lastSavedAt}
        canEdit={canEdit}
        readOnlyReason={block?.kind === "lock" ? "Locked" : block?.kind === "maintenance" ? "Maintenance" : null}
        titleName={data?.title.title ?? null}
        viewers={live.viewers}
        commentCount={comments.data?.comments.length ?? 0}
        commentsOn={settings.features.comments}
        onPanel={(tab) => setPanel({ open: true, tab, thread: null })}
      />
      {block && block.kind !== "viewer" ? <ReadOnlyBanner kind={block.kind} message={block.message} lockedAt={block.lock?.lockedAt} /> : null}
      {!data || !grid || !totals ? (
        <TitleSkeleton />
      ) : (
        <div className="flex flex-col gap-4 px-5 pb-6 lg:px-6">
          <TitleHeader data={data} totals={totals} />
          <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <DetailsCard
              data={data}
              canEdit={canEdit}
              onNotes={(titleNotes) => plan.mutate({ titleNotes })}
              notesSaving={plan.isPending && plan.variables?.titleNotes !== undefined}
              notesSavedAt={notesSavedAt}
            />
            <CompPanel
              isbn={isbn}
              comp={data.comp}
              canEdit={canEdit}
              saving={plan.isPending && plan.variables?.compIsbn !== undefined}
              onChange={changeComp}
            />
          </div>

          <Card
            className={cn("flex flex-col overflow-hidden", full && "fixed inset-0 z-40 rounded-none border-0 shadow-none")}
            data-testid="grid-card"
            data-full={full ? "true" : undefined}
            role={full ? "region" : undefined}
            aria-label={full ? `${data.title.title} — full-screen grid` : undefined}
          >
            {full ? (
              <FullScreenHeader
                data={data}
                totals={totals}
                canEdit={canEdit}
                readOnlyReason={block?.kind === "lock" ? "Locked" : block?.kind === "maintenance" ? "Maintenance" : null}
                status={autosave.status}
                lastSavedAt={autosave.lastSavedAt}
                compSaving={plan.isPending && plan.variables?.compIsbn !== undefined}
                viewers={live.viewers}
                onComp={changeComp}
                onExit={() => setFull(false)}
              />
            ) : null}
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
              {canEdit ? (
                <div className="flex items-center gap-0.5 border-l border-line pl-2">
                  <Tooltip content="Undo (Ctrl Z)">
                    <Button size="icon-sm" variant="ghost" disabled={!canUndo} onClick={() => runUndo("undo")} aria-label="Undo">
                      <Undo2 />
                    </Button>
                  </Tooltip>
                  <Tooltip content="Redo (Ctrl Y)">
                    <Button size="icon-sm" variant="ghost" disabled={!canRedo} onClick={() => runUndo("redo")} aria-label="Redo">
                      <Redo2 />
                    </Button>
                  </Tooltip>
                </div>
              ) : null}
              <div className="ml-auto flex items-center gap-3">
                <Legend />
                <ShortcutsHelp />
                {canEdit ? <AddAccountDialog onPick={addAccount} /> : null}
                <Tooltip content={full ? "Exit full screen (Esc)" : "Full screen — work on the grid using the whole screen"}>
                  <Button size="sm" variant={full ? "primary" : "outline"} onClick={() => setFull(!full)} data-testid="grid-fullscreen">
                    {full ? <Minimize2 /> : <Maximize2 />}
                    {full ? "Exit full screen" : "Full screen"}
                  </Button>
                </Tooltip>
              </div>
            </div>
            <div className={cn(full && "min-h-0 flex-1")}>
              <EstimatesGrid
                fill={full}
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
                conflicts={autosave.conflicts}
                onResolve={autosave.resolve}
                remoteCells={live.remoteCells}
                othersEditing={othersEditing}
                commentCounts={commentCounts}
                onOpenThread={openThread}
                onEditingChange={setEditingCell}
              />
            </div>
          </Card>
        </div>
      )}
      <ActivityPanel
        isbn={isbn}
        open={panel.open}
        onOpenChange={(open) => setPanel((prev) => ({ ...prev, open }))}
        tab={panel.tab}
        onTab={(tab) => setPanel((prev) => ({ ...prev, tab }))}
        thread={panel.thread}
        onThread={(thread) => setPanel((prev) => ({ ...prev, thread }))}
        onShowRow={showRow}
        me={{ email: me?.email ?? "", role: me?.role ?? "viewer" }}
        canEdit={canEdit}
        commentsOn={settings.features.comments}
        currentValue={currentValue}
        onRestore={restore}
      />
    </div>
  );
}

/** What the grid's number styles mean, in plain words. */
function Legend() {
  return (
    <div className="hidden items-center gap-4 text-xs text-ink-2 lg:flex">
      <Tooltip content="Grey italic numbers add up the rows below. Type over one to set that level yourself.">
        <span className="flex cursor-help items-center gap-1.5">
          <span className="num italic text-muted">1,240</span> Total of the rows below
        </span>
      </Tooltip>
      <Tooltip content="A value typed on a channel or organization row replaces the total of its rows below.">
        <span className="flex cursor-help items-center gap-1.5">
          <span className="size-2 rounded-full bg-info" /> Manual value (overrides the rows below)
        </span>
      </Tooltip>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Enter or F2", "Edit the selected cell"],
  ["Type a number", "Replace the value"],
  ["Delete", "Clear the cell"],
  ["Arrows / Tab", "Move between cells (also saves the cell you are typing in)"],
  ["Ctrl V", "Paste a block copied from Excel"],
  ["Ctrl C", "Copy the cell"],
  ["Ctrl Z / Ctrl Y", "Undo / redo"],
  ["Alt ← / Alt →", "Previous / next title"],
];

function ShortcutsHelp() {
  return (
    <Popover>
      <Tooltip content="Keyboard shortcuts">
        <PopoverTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Keyboard shortcuts">
            <Keyboard />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="mb-2 text-[13px] font-semibold">Keyboard shortcuts</div>
        <dl className="space-y-1.5 text-[13px]">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">{v}</dt>
              <dd>
                <Kbd>{k}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

/** The list this title is being worked through (a work list, or all titles by pub date) and its neighbours. */
function useTitleNav(isbn: string) {
  const worklist = useWorklist();
  const summary = useSummary();
  const list = useMemo(() => {
    if (worklist?.isbns.includes(isbn)) return worklist;
    const all = [...(summary.data?.titles ?? [])].sort((a, b) => (a.pubDate ?? "").localeCompare(b.pubDate ?? "") || a.isbn.localeCompare(b.isbn));
    return { isbns: all.map((t) => t.isbn), label: "All titles", href: "/summary" };
  }, [worklist, isbn, summary.data]);
  const idx = list.isbns.indexOf(isbn);
  return {
    list,
    idx,
    prev: idx > 0 ? list.isbns[idx - 1] : undefined,
    next: idx >= 0 && idx < list.isbns.length - 1 ? list.isbns[idx + 1] : undefined,
  };
}

/**
 * Header of the full-screen grid: the essentials for data entry — which title, Previous / Next,
 * the comparable title (with Change), the key totals and the save status.
 */
function FullScreenHeader({
  data,
  totals,
  canEdit,
  readOnlyReason,
  status,
  lastSavedAt,
  compSaving,
  viewers,
  onComp,
  onExit,
}: {
  viewers: Viewer[];
  data: TitleDetail;
  totals: ReturnType<typeof titleTotals>;
  canEdit: boolean;
  readOnlyReason: string | null;
  status: SaveStatus;
  lastSavedAt: number | null;
  compSaving: boolean;
  onComp: (compIsbn: string | null) => void;
  onExit: () => void;
}) {
  const t = data.title;
  const { list, idx, prev, next } = useTitleNav(t.isbn);
  const gap = totals.estimateVsGoal;
  const stat = (label: string, value: string, tone?: string) => (
    <div className="min-w-0 leading-tight">
      <div className="truncate text-[10.5px] uppercase tracking-wide text-subtle">{label}</div>
      <div className={cn("num text-[14px] font-semibold", tone)}>{value}</div>
    </div>
  );
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface-2/60 px-4 py-2.5" data-testid="fullscreen-header">
      <Tooltip content="Exit full screen (Esc)">
        <Button variant="ghost" size="icon-sm" onClick={onExit} aria-label="Exit full screen">
          <Minimize2 />
        </Button>
      </Tooltip>
      <div className="flex items-center gap-1">
        <Tooltip content={prev ? "Previous title (Alt ←)" : null}>
          <Button asChild={!!prev} variant="outline" size="icon-sm" disabled={!prev} aria-label="Previous title">
            {prev ? (
              <Link href={`/titles/${prev}?grid=full`}>
                <ChevronLeft />
              </Link>
            ) : (
              <ChevronLeft />
            )}
          </Button>
        </Tooltip>
        <span className="num min-w-[70px] text-center text-xs text-muted" title={list.label}>
          {idx >= 0 ? `${fmtInt(idx + 1)} of ${fmtInt(list.isbns.length)}` : ""}
        </span>
        <Tooltip content={next ? "Next title (Alt →)" : null}>
          <Button asChild={!!next} variant="outline" size="icon-sm" disabled={!next} aria-label="Next title">
            {next ? (
              <Link href={`/titles/${next}?grid=full`}>
                <ChevronRight />
              </Link>
            ) : (
              <ChevronRight />
            )}
          </Button>
        </Tooltip>
      </div>
      <div className="min-w-0 max-w-[260px]">
        <div className="truncate text-[15px] font-semibold" title={t.title}>
          {t.title}
        </div>
        <div className="num flex items-center gap-1.5 truncate text-xs text-muted">
          {t.isbn}
          {t.season ? <Badge tone="info">{t.season}</Badge> : null}
          {t.format ? <span>· {t.format}</span> : null}
        </div>
      </div>
      <div className="hidden items-center gap-4 border-l border-line pl-4 xl:flex">
        {stat("Initial", fmtInt(totals.initialOrder))}
        {stat("Goal", fmtInt(totals.laydownGoal))}
        {stat("Estimate", fmtInt(totals.laydownEstimate))}
        {stat("6-month", fmtInt(totals.sixMonthEstimate))}
        {stat("Vs goal", gap === null ? "—" : fmtSigned(-gap), gap === null ? "text-muted" : gap > 0 ? "text-warn" : gap < 0 ? "text-ok" : undefined)}
      </div>
      <div className="ml-auto flex min-w-0 items-center gap-2">
        <div data-testid="fullscreen-presence" className="contents">
          <Presence viewers={viewers} />
        </div>
        {viewers.length ? <span className="mx-1 h-6 w-px bg-line" /> : null}
        <div className="min-w-0 text-right leading-tight" data-testid="fullscreen-comp">
          <div className="text-[10.5px] uppercase tracking-wide text-subtle">Comparable title</div>
          {data.comp ? (
            <div className="max-w-[220px] truncate text-[13px] font-medium" title={`${data.comp.title} (${data.comp.isbn})`}>
              {data.comp.title} <span className="num text-xs font-normal text-muted">{data.comp.isbn}</span>
            </div>
          ) : (
            <div className="text-[13px] text-muted">None yet</div>
          )}
        </div>
        {compSaving ? <Spinner className="size-3.5" /> : null}
        {canEdit ? <CompPicker isbn={t.isbn} hasComp={!!data.comp} onPick={onComp} /> : null}
        <span className="mx-1 h-6 w-px bg-line" />
        {canEdit ? <SaveIndicator status={status} lastSavedAt={lastSavedAt} /> : <ReadOnlyBadge reason={readOnlyReason} />}
      </div>
    </div>
  );
}

function TopBar({
  isbn,
  status,
  lastSavedAt,
  canEdit,
  readOnlyReason,
  titleName,
  viewers,
  commentCount,
  commentsOn,
  onPanel,
}: {
  isbn: string;
  status: SaveStatus;
  lastSavedAt: number | null;
  canEdit: boolean;
  readOnlyReason: string | null;
  titleName: string | null;
  viewers: Viewer[];
  commentCount: number;
  commentsOn: boolean;
  onPanel: (tab: PanelTab) => void;
}) {
  const router = useRouter();
  const prefetch = usePrefetchTitle();

  const { list, idx, prev, next } = useTitleNav(isbn);

  useEffect(() => {
    const t = setTimeout(() => {
      prefetch(next);
      prefetch(prev);
    }, 250);
    return () => clearTimeout(t);
  }, [next, prev, prefetch]);

  const keepFull = useSearchParams().get("grid") === "full" ? "?grid=full" : "";
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        router.push(`/titles/${next}${keepFull}`);
      } else if (e.key === "ArrowLeft" && prev) {
        e.preventDefault();
        router.push(`/titles/${prev}${keepFull}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, router, keepFull]);

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
      <div className="ml-auto flex items-center gap-2">
        <Presence viewers={viewers} />
        {commentsOn ? (
          <Button variant="ghost" size="sm" onClick={() => onPanel("comments")}>
            <MessageSquare />
            Comments
            {commentCount ? <span className="num rounded-full bg-info-soft px-1.5 text-[11px] font-semibold text-info">{commentCount}</span> : null}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => onPanel("history")}>
          <History />
          History
        </Button>
        {titleName ? (
          <Tooltip content="Share this title in Ask Abrams">
            <Button variant="ghost" size="sm" onClick={() => shareInAskAbrams(isbn, titleName)}>
              <Share2 />
              Share
            </Button>
          </Tooltip>
        ) : null}
        <span className="mx-1 h-5 w-px bg-line" />
        {canEdit ? <SaveIndicator status={status} lastSavedAt={lastSavedAt} /> : <ReadOnlyBadge reason={readOnlyReason} />}
      </div>
    </div>
  );
}

/** Who else has this title open right now (initials avatars; editing shown in the tooltip). */
function Presence({ viewers }: { viewers: Viewer[] }) {
  if (!viewers.length) return null;
  const shown = viewers.slice(0, 4);
  return (
    <div className="mr-1 flex items-center">
      <div className="flex -space-x-1.5">
        {shown.map((v) => (
          <Tooltip key={v.email} content={`${v.name} ${v.cell ? "is editing a cell" : "is viewing this title"}`}>
            <span
              className={cn(
                "relative flex size-7 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-canvas",
                v.cell && "outline outline-2 outline-offset-1",
              )}
              style={{ background: personColor(v.email), outlineColor: personColor(v.email) }}
            >
              {initials(v.name, v.email)}
              <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-ok ring-2 ring-canvas" />
            </span>
          </Tooltip>
        ))}
      </div>
      {viewers.length > shown.length ? <span className="num ml-1.5 text-xs text-muted">+{viewers.length - shown.length}</span> : null}
    </div>
  );
}

function ReadOnlyBadge({ reason }: { reason: string | null }) {
  return (
    <Badge tone={reason ? "warn" : "neutral"} className="gap-1.5 py-1">
      {reason === "Locked" ? <Lock className="size-3.5" /> : <Eye className="size-3.5" />}
      {reason ?? "View only"}
    </Badge>
  );
}

/** Why this title can't be changed right now (lock, maintenance, access limit). */
function ReadOnlyBanner({ kind, message, lockedAt }: { kind: "maintenance" | "lock" | "scope"; message: string; lockedAt?: string }) {
  const Icon = kind === "lock" ? Lock : kind === "maintenance" ? Wrench : ShieldAlert;
  const lead = kind === "lock" ? "This title is locked." : kind === "maintenance" ? "Read-only for maintenance." : "View only for you.";
  return (
    <div role="status" data-testid="read-only-banner" className="mx-5 mt-3 flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-[13px] text-ink lg:mx-6">
      <Icon className="mt-0.5 size-4 shrink-0 text-warn" />
      <p>
        <span className="font-semibold">{lead}</span> {message}
        {lockedAt ? (
          <span className="text-muted" suppressHydrationWarning>
            {" "}
            · locked {fmtDate(lockedAt)}
          </span>
        ) : null}
      </p>
    </div>
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
  return <span className="text-xs text-muted">Changes save automatically</span>;
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
            {t.season ? <Badge tone="info">{t.season}</Badge> : null}
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
                <Tooltip content={new Date(t.plan.updatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}>
                  <span className="cursor-default">
                    Updated {timeAgo(t.plan.updatedAt)}
                    {t.plan.updatedBy ? ` by ${t.plan.updatedBy.split("@")[0]}` : ""}
                  </span>
                </Tooltip>
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
          label="Estimate vs goal"
          value={gap === null ? "Not set" : fmtSigned(-gap)}
          tone={gap === null ? "text-muted text-[17px]" : gap > 0 ? "text-warn" : gap < 0 ? "text-ok" : undefined}
          hint={gap === null ? "Enter a goal and an estimate in the grid" : gap > 0 ? "Below goal" : gap < 0 ? "Above goal" : "On goal"}
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


function DetailsCard({
  data,
  canEdit,
  onNotes,
  notesSaving,
  notesSavedAt,
}: {
  data: TitleDetail;
  canEdit: boolean;
  onNotes: (notes: string) => void;
  notesSaving: boolean;
  notesSavedAt: number | null;
}) {
  const t = data.title;
  const notesLimit = useAppSettings().rules.titleNoteMaxLength;
  const [notes, setNotes] = useState(t.plan.titleNotes);
  const [sent, setSent] = useState(t.plan.titleNotes);
  useEffect(() => {
    if (notes === sent) return;
    const timer = setTimeout(() => {
      setSent(notes);
      onNotes(notes);
    }, 900);
    return () => clearTimeout(timer);
  }, [notes, sent, onNotes]);
  const noteStatus = notes !== sent || notesSaving ? "Saving…" : notesSavedAt ? `Saved ${timeAgo(new Date(notesSavedAt).toISOString())}` : null;

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
              <dd className={cn("num truncate", v === "—" ? "text-subtle" : "text-ink")}>{v === "—" ? "Not set" : v}</dd>
            </div>
          ))}
        </dl>
        {t.competitiveTitles.length ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
            <span className="text-muted">Competitive titles:</span>
            {t.competitiveTitles.map((c) => {
              const name = data.competitive.find((x) => x.isbn === c)?.title;
              return name ? (
                <Tooltip key={c} content="Open in new tab">
                  <a
                    href={`/titles/${c}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex items-center gap-1 font-medium text-info hover:underline"
                  >
                    {name} <span className="num font-normal text-muted">{c}</span>
                    <ExternalLink className="size-3" />
                  </a>
                </Tooltip>
              ) : (
                <span key={c} className="num text-ink-2">
                  {c}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
      {/* The cover fills the space beside the details; notes run the full width underneath. */}
      <TitleCover isbn={t.isbn} title={t.title} className="h-full min-h-[220px] w-full" />
      <div className="flex flex-col lg:col-span-2">
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <label htmlFor="title-notes" className="text-[13px] font-semibold">
            Title notes
          </label>
          {canEdit && noteStatus ? (
            <span className={cn("flex items-center gap-1 text-xs", noteStatus === "Saving…" ? "text-muted" : "text-ok")}>
              {noteStatus === "Saving…" ? <Spinner className="size-3" /> : <Check className="size-3.5" />}
              {noteStatus}
            </span>
          ) : null}
        </div>
        <Textarea
          id="title-notes"
          value={notes}
          maxLength={notesLimit}
          onChange={(e) => setNotes(e.target.value)}
          readOnly={!canEdit}
          placeholder={canEdit ? "Add a note for the whole title… (saved automatically)" : "No notes"}
          className="h-28 overflow-y-auto focus:border-info/60 focus:ring-info/15"
        />
        {canEdit ? (
          <div className={cn("mt-1 text-right text-[11px]", notes.length > notesLimit * 0.9 ? "text-warn" : "text-subtle")}>
            {fmtInt(notes.length)} / {fmtInt(notesLimit)}
          </div>
        ) : null}
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
