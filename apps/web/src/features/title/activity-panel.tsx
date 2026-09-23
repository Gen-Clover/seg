"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { EstimateEventDoc } from "@seg/data";
import { Button } from "@/components/ui/button";
import { Badge, Input, Skeleton, Spinner } from "@/components/ui/misc";
import { Dialog, SheetContent, Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { clockTime } from "@/lib/people";
import { queryKeys, usePersonName } from "@/lib/queries";
import { cn, fmtDate, fmtInt } from "@/lib/utils";
import { CommentsTab, type ThreadTarget } from "./comments";

export type HistoryItem = Omit<EstimateEventDoc, "syncedAt">;
export type PanelTab = "comments" | "history";

const FIELD_LABEL: Record<string, string> = {
  laydownGoal: "Laydown goal",
  laydownEstimate: "Laydown estimate",
  sixMonthEstimate: "6-month estimate",
  salesNotes: "Sales notes",
  compIsbn: "Comparable title",
  titleNotes: "Title notes",
};

function rowLabel(e: HistoryItem): { level: string; name: string } {
  if (e.level === "title") return { level: "Title", name: "Title details" };
  if (e.level === "channel") return { level: "Channel", name: e.channelName ?? e.channelId ?? "—" };
  if (e.level === "org") return { level: "Organization", name: `${e.orgName ?? e.orgId} · ${e.channelName ?? e.channelId}` };
  return { level: "Account", name: `${e.accountName ?? e.accountId} · ${e.orgName ?? e.orgId}` };
}

const show = (v: string | number | null) => (v === null || v === "" ? "—" : typeof v === "number" ? fmtInt(v) : v);
const localDay = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return fmtDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
};

/** Title side panel: comments and change history. */
export function ActivityPanel({
  isbn,
  open,
  onOpenChange,
  tab,
  onTab,
  thread,
  onThread,
  onShowRow,
  me,
  canEdit,
  currentValue,
  onRestore,
}: {
  isbn: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  thread: ThreadTarget | null;
  onThread: (t: ThreadTarget | null) => void;
  onShowRow: (t: ThreadTarget) => void;
  me: { email: string; role: string };
  canEdit: boolean;
  /** The value a history item's cell holds now (to hide pointless restores). */
  currentValue: (item: HistoryItem) => string | number | null | undefined;
  onRestore: (item: HistoryItem) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? (
        <SheetContent title={tab === "comments" ? "Comments" : "Change history"} description={tab === "comments" ? "Conversations on this title and its rows." : "Every saved change on this title, newest first."}>
          <div className="flex gap-1 border-b border-line px-4 pt-1">
            {(["comments", "history"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onTab(t)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
                  tab === t ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t === "comments" ? "Comments" : "History"}
              </button>
            ))}
          </div>
          {tab === "comments" ? (
            <CommentsTab isbn={isbn} thread={thread} onThread={onThread} onShowRow={onShowRow} me={me} />
          ) : (
            <HistoryList isbn={isbn} canEdit={canEdit} currentValue={currentValue} onRestore={onRestore} />
          )}
        </SheetContent>
      ) : null}
    </Dialog>
  );
}

function HistoryList({
  isbn,
  canEdit,
  currentValue,
  onRestore,
}: {
  isbn: string;
  canEdit: boolean;
  currentValue: (item: HistoryItem) => string | number | null | undefined;
  onRestore: (item: HistoryItem) => void;
}) {
  const [q, setQ] = useState("");
  const who = usePersonName();
  const history = useInfiniteQuery({
    queryKey: queryKeys.history(isbn),
    queryFn: ({ pageParam }) =>
      api<{ items: HistoryItem[]; next: string | null }>(
        `/api/titles/${encodeURIComponent(isbn)}/history${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: "",
    getNextPageParam: (last) => last.next ?? undefined,
    // Always fresh when the panel opens: edits may have been saved seconds ago.
    staleTime: 0,
  });

  const items = useMemo(() => history.data?.pages.flatMap((p) => p.items) ?? [], [history.data]);
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((e) => {
      const r = rowLabel(e);
      const hay = `${r.level} ${r.name} ${FIELD_LABEL[e.field] ?? e.field} ${e.changedBy} ${e.oldValue ?? ""} ${e.newValue ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [items, q]);

  const days = useMemo(() => {
    const groups: { day: string; items: HistoryItem[] }[] = [];
    for (const e of filtered) {
      const day = localDay(e.changedAt);
      const last = groups[groups.length - 1];
      if (last?.day === day) last.items.push(e);
      else groups.push({ day, items: [e] });
    }
    return groups;
  }, [filtered]);

  return (
    <>
      <div className="border-b border-line px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by account, field, person or value" className="pl-8" />
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {history.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : history.isError ? (
          <p className="p-8 text-center text-[13px] text-muted">
            History couldn&apos;t be loaded.{" "}
            <button className="text-brand underline" onClick={() => history.refetch()}>
              Try again
            </button>
          </p>
        ) : !items.length ? (
          <p className="p-10 text-center text-[13px] text-muted">No changes yet. Edits you make on this title will appear here.</p>
        ) : !filtered.length ? (
          <p className="p-10 text-center text-[13px] text-muted">No changes match &ldquo;{q}&rdquo; in what&apos;s loaded.</p>
        ) : (
          days.map((g) => (
            <section key={g.day}>
              <h3 className="sticky top-0 z-10 border-b border-line bg-surface-2/95 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted backdrop-blur">
                {g.day}
              </h3>
              <ol>
                {g.items.map((e) => {
                  const r = rowLabel(e);
                  const now = currentValue(e);
                  const restorable = canEdit && now !== undefined && String(now ?? "") !== String(e.oldValue ?? "");
                  return (
                    <li key={e._id} className="group border-b border-line/70 px-5 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-ink-2">{who(e.changedBy)}</span>
                        <span>{clockTime(e.changedAt)}</span>
                        {e.source !== "grid" ? (
                          <Badge tone={e.source === "upload" ? "info" : "neutral"} className="capitalize">
                            {e.source}
                          </Badge>
                        ) : null}
                        {restorable ? (
                          <Tooltip content={`Set ${FIELD_LABEL[e.field] ?? e.field} back to ${show(e.oldValue)}`}>
                            <button
                              type="button"
                              onClick={() => onRestore(e)}
                              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-info opacity-0 hover:bg-info-soft focus:opacity-100 group-hover:opacity-100"
                            >
                              <RotateCcw className="size-3" />
                              Restore
                            </button>
                          </Tooltip>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[13px] text-ink">
                        <span className="font-medium">{FIELD_LABEL[e.field] ?? e.field}</span>
                        <span className="text-muted"> · {r.name}</span>
                        <span className="ml-1.5 text-[11px] text-subtle">{r.level}</span>
                      </div>
                      <div className="num mt-1 flex items-start gap-1.5 text-[13px]">
                        <span className="min-w-0 break-words text-subtle line-through decoration-subtle/60">{show(e.oldValue)}</span>
                        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                        <span className="min-w-0 break-words font-medium text-ink">{show(e.newValue)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))
        )}
        {history.hasNextPage ? (
          <div className="p-4 text-center">
            <Button size="sm" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
              {history.isFetchingNextPage ? <Spinner className="size-3.5" /> : null}
              Load older changes
            </Button>
          </div>
        ) : null}
      </div>
      <div className="border-t border-line px-5 py-2 text-xs text-muted">
        {fmtInt(items.length)} change{items.length === 1 ? "" : "s"} loaded{history.hasNextPage ? " · more available" : ""}
      </div>
    </>
  );
}
