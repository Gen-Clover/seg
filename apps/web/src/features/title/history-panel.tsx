"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowRight, History, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { EstimateEventDoc } from "@seg/data";
import { Button } from "@/components/ui/button";
import { Badge, Input, Skeleton, Spinner } from "@/components/ui/misc";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import { fmtDate, fmtInt } from "@/lib/utils";

type HistoryItem = Omit<EstimateEventDoc, "syncedAt">;

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
const who = (email: string) => email.split("@")[0];
const localDay = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return fmtDate(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
};
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Every change made to a title — grid edits, uploads and comparable-title changes — newest first. */
export function HistoryPanel({ isbn }: { isbn: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <History />
          History
        </Button>
      </DialogTrigger>
      {open ? (
        <SheetContent title="Change history" description="Every saved change on this title, newest first.">
          <HistoryList isbn={isbn} />
        </SheetContent>
      ) : null}
    </Dialog>
  );
}

function HistoryList({ isbn }: { isbn: string }) {
  const [q, setQ] = useState("");
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
                  return (
                    <li key={e._id} className="border-b border-line/70 px-5 py-2.5">
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <span className="font-medium text-ink-2">{who(e.changedBy)}</span>
                        <span>{time(e.changedAt)}</span>
                        {e.source !== "grid" ? <Badge tone={e.source === "upload" ? "info" : "neutral"} className="capitalize">{e.source}</Badge> : null}
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
