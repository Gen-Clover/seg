"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, ArrowRight, AtSign, CheckCheck, GitCompareArrows, PlayCircle, TrendingDown, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { belowGoal, dueSoon, withoutComparable, type DueItem, type GapItem, type NoCompItem } from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge, Card, Skeleton } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { api } from "@/lib/api";
import { initials, personColor } from "@/lib/people";
import {
  queryKeys,
  useDesk,
  useNotifications,
  useSummary,
  useUnreadCount,
  type ChangedTitle,
  type NotificationView,
  type TitleSummaryRow,
} from "@/lib/queries";
import { useLocalPref } from "@/lib/use-local-pref";
import { cn, fmtDate, fmtInt, timeAgo } from "@/lib/utils";
import { setWorklist } from "@/lib/worklist";

type Tab = "due" | "gap" | "comp" | "changed" | "mentions";

const WINDOWS = [7, 14, 30] as const;

function todayLocal() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** Home page: what needs attention today, for this person. */
export function DeskView({ name }: { name: string }) {
  const router = useRouter();
  const summary = useSummary();
  const desk = useDesk();
  const unread = useUnreadCount();
  const [tab, setTab] = useState<Tab>("due");
  const [windowPref, setWindowPref] = useLocalPref("seg-desk-window", "14");
  const [scopePref, setScopePref] = useLocalPref("seg-desk-scope", "{}");
  const windowDays = Number(windowPref) || 14;
  const scope = useMemo(() => {
    try {
      const s = JSON.parse(scopePref) as { divisions?: string[]; imprints?: string[] };
      return { divisions: s.divisions ?? [], imprints: s.imprints ?? [] };
    } catch {
      return { divisions: [], imprints: [] };
    }
  }, [scopePref]);
  const setScope = (next: { divisions: string[]; imprints: string[] }) => setScopePref(JSON.stringify(next));

  const all = useMemo(() => summary.data?.titles ?? [], [summary.data]);
  const byIsbn = useMemo(() => new Map(all.map((t) => [t.isbn, t])), [all]);
  const titles = useMemo(
    () =>
      all.filter(
        (t) =>
          (!scope.divisions.length || scope.divisions.includes(t.division ?? "")) &&
          (!scope.imprints.length || scope.imprints.includes(t.imprint ?? "")),
      ),
    [all, scope],
  );
  const inScope = useMemo(() => new Set(titles.map((t) => t.isbn)), [titles]);

  const today = todayLocal();
  const lists = useMemo(
    () => ({
      due: dueSoon(titles, today, windowDays),
      gap: belowGoal(titles),
      comp: withoutComparable(titles, today).filter((c) => c.daysToPub === null || c.daysToPub >= 0),
      changed: (desk.data?.changed ?? []).filter((c) => inScope.has(c.isbn) || !byIsbn.has(c.isbn)),
    }),
    [titles, today, windowDays, desk.data, inScope, byIsbn],
  );

  const facet = (get: (t: TitleSummaryRow) => string | null) => {
    const counts = new Map<string, number>();
    for (const t of all) {
      const v = get(t);
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([value, count]) => ({ value, label: value, count }));
  };

  const open = (isbn: string, list: string[], label: string) => {
    setWorklist({ isbns: list, label, href: "/" });
    router.push(`/titles/${isbn}`);
  };

  const loading = summary.isPending;
  const overdue = lists.due.filter((d) => d.daysLeft < 0).length;
  const gapTotal = lists.gap.reduce((s, g) => s + g.gap, 0);
  const kpis: { tab: Tab; label: string; value: number; sub: string; icon: React.ElementType; tone?: string }[] = [
    { tab: "due", label: "Due soon", value: lists.due.length, sub: overdue ? `${overdue} overdue` : `next ${windowDays} days`, icon: AlarmClock, tone: overdue ? "text-brand" : undefined },
    { tab: "gap", label: "Below goal", value: lists.gap.length, sub: gapTotal ? `${fmtInt(gapTotal)} units short` : "all on goal", icon: TrendingDown, tone: lists.gap.length ? "text-warn" : undefined },
    { tab: "comp", label: "No comparable", value: lists.comp.length, sub: "upcoming titles", icon: GitCompareArrows },
    { tab: "changed", label: "Changed by others", value: lists.changed.length, sub: "since your last visit", icon: Users },
    { tab: "mentions", label: "Mentions", value: unread.data?.unread ?? 0, sub: "unread", icon: AtSign, tone: unread.data?.unread ? "text-info" : undefined },
  ];

  const tabIsbns: Record<Exclude<Tab, "mentions">, string[]> = {
    due: lists.due.map((d) => d.isbn),
    gap: lists.gap.map((d) => d.isbn),
    comp: lists.comp.map((d) => d.isbn),
    changed: lists.changed.filter((c) => byIsbn.has(c.isbn)).map((d) => d.isbn),
  };
  const tabLabel: Record<Tab, string> = { due: "Due soon", gap: "Below goal", comp: "No comparable", changed: "Changed by others", mentions: "Mentions" };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 lg:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" suppressHydrationWarning>
            {greeting()}
            {name ? `, ${name.split(" ")[0]}` : ""}
          </h1>
          <p className="text-[13px] text-muted">Here&apos;s what needs your attention across your titles.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect label="Division" options={facet((t) => t.division)} selected={scope.divisions} onChange={(divisions) => setScope({ ...scope, divisions })} />
          <MultiSelect label="Imprint" options={facet((t) => t.imprint)} selected={scope.imprints} onChange={(imprints) => setScope({ ...scope, imprints })} />
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWindowPref(String(w))}
                className={cn("rounded-md px-2 py-1 font-medium", windowDays === w ? "bg-ink text-surface" : "text-muted hover:text-ink")}
              >
                {w} days
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((k) => (
          <button
            key={k.tab}
            type="button"
            onClick={() => setTab(k.tab)}
            className={cn(
              "rounded-xl border bg-surface px-4 py-3 text-left shadow-[var(--shadow-card)] transition-colors",
              tab === k.tab ? "border-brand/50 ring-2 ring-brand/15" : "border-line hover:border-line-strong",
            )}
          >
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <k.icon className="size-3.5" />
              {k.label}
            </div>
            {loading && k.tab !== "mentions" ? (
              <Skeleton className="mt-2 h-6 w-12" />
            ) : (
              <div className={cn("num mt-1 text-[22px] font-semibold tracking-tight", k.tone)}>{fmtInt(k.value)}</div>
            )}
            <div className="truncate text-xs text-subtle">{k.sub}</div>
          </button>
        ))}
      </div>

      <Card className="flex min-h-[420px] flex-col overflow-hidden">
        <div className="flex items-center gap-1 border-b border-line px-3 pt-1">
          {kpis.map((k) => (
            <button
              key={k.tab}
              type="button"
              onClick={() => setTab(k.tab)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-medium",
                tab === k.tab ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {k.label}
              <span className="num rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{fmtInt(k.value)}</span>
            </button>
          ))}
          {tab !== "mentions" && tabIsbns[tab].length ? (
            <Button size="sm" variant="primary" className="ml-auto" onClick={() => open(tabIsbns[tab][0]!, tabIsbns[tab], `My Desk · ${tabLabel[tab]}`)}>
              <PlayCircle />
              Work through these ({fmtInt(tabIsbns[tab].length)})
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : tab === "due" ? (
            <List empty={`Nothing due in the next ${windowDays} days — every title with a near deadline has its estimates in.`}>
              {lists.due.map((d) => (
                <DueRow key={d.isbn} item={d} title={byIsbn.get(d.isbn)} onOpen={() => open(d.isbn, tabIsbns.due, "My Desk · Due soon")} />
              ))}
            </List>
          ) : tab === "gap" ? (
            <List empty="No title is below its laydown goal.">
              {lists.gap.map((g) => (
                <GapRow key={g.isbn} item={g} title={byIsbn.get(g.isbn)} onOpen={() => open(g.isbn, tabIsbns.gap, "My Desk · Below goal")} />
              ))}
            </List>
          ) : tab === "comp" ? (
            <List empty="Every upcoming title has a comparable title.">
              {lists.comp.map((c) => (
                <CompRow key={c.isbn} item={c} title={byIsbn.get(c.isbn)} onOpen={() => open(c.isbn, tabIsbns.comp, "My Desk · No comparable")} />
              ))}
            </List>
          ) : tab === "changed" ? (
            desk.isPending ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <List empty="Nobody else has changed your titles since you last looked.">
                {lists.changed.map((c) => (
                  <ChangedRow key={c.isbn} item={c} title={byIsbn.get(c.isbn)} onOpen={() => open(c.isbn, tabIsbns.changed, "My Desk · Changed by others")} />
                ))}
              </List>
            )
          ) : (
            <Mentions />
          )}
        </div>
      </Card>
    </div>
  );
}

function List({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  if (!children.length) return <p className="px-6 py-16 text-center text-[13px] text-muted">{empty}</p>;
  return <ul className="divide-y divide-line/70">{children}</ul>;
}

function TitleCell({ title, isbn }: { title?: TitleSummaryRow; isbn: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate text-[13px] font-medium text-ink">{title?.title ?? isbn}</div>
      <div className="num truncate text-xs text-muted">
        {isbn}
        {title?.author ? <span className="text-subtle"> · {title.author}</span> : null}
        {title?.season ? <span className="text-subtle"> · {title.season}</span> : null}
      </div>
    </div>
  );
}

function RowShell({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className="group flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-surface-2/60">
        {children}
        <ArrowRight className="size-4 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </li>
  );
}

function DueRow({ item, title, onOpen }: { item: DueItem; title?: TitleSummaryRow; onOpen: () => void }) {
  const when =
    item.daysLeft < 0
      ? `overdue by ${-item.daysLeft} day${item.daysLeft === -1 ? "" : "s"}`
      : item.daysLeft === 0
        ? "today"
        : `in ${item.daysLeft} day${item.daysLeft === 1 ? "" : "s"}`;
  return (
    <RowShell onOpen={onOpen}>
      <TitleCell title={title} isbn={item.isbn} />
      <div className="hidden flex-wrap justify-end gap-1 md:flex">
        {item.missing.map((m) => (
          <Badge key={m}>No {m.toLowerCase()}</Badge>
        ))}
      </div>
      <div className="w-44 shrink-0 text-right">
        <Badge tone={item.daysLeft < 0 ? "brand" : item.daysLeft <= 7 ? "warn" : "neutral"}>
          {item.milestone} {when}
        </Badge>
        <div className="num mt-0.5 text-[11px] text-subtle">{fmtDate(item.date)}</div>
      </div>
    </RowShell>
  );
}

function GapRow({ item, title, onOpen }: { item: GapItem; title?: TitleSummaryRow; onOpen: () => void }) {
  const goal = title?.totals.laydownGoal ?? 0;
  const est = title?.totals.laydownEstimate ?? 0;
  return (
    <RowShell onOpen={onOpen}>
      <TitleCell title={title} isbn={item.isbn} />
      <div className="hidden w-56 shrink-0 md:block">
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-warn" style={{ width: `${Math.round(item.ratio * 100)}%` }} />
        </div>
        <div className="num mt-1 flex justify-between text-[11px] text-muted">
          <span>Est. {fmtInt(est)}</span>
          <span>Goal {fmtInt(goal)}</span>
        </div>
      </div>
      <div className="w-28 shrink-0 text-right">
        <div className="num text-[13px] font-semibold text-warn">−{fmtInt(item.gap)}</div>
        <div className="num text-[11px] text-subtle">{Math.round(item.ratio * 100)}% of goal</div>
      </div>
    </RowShell>
  );
}

function CompRow({ item, title, onOpen }: { item: NoCompItem; title?: TitleSummaryRow; onOpen: () => void }) {
  return (
    <RowShell onOpen={onOpen}>
      <TitleCell title={title} isbn={item.isbn} />
      <div className="hidden text-xs text-muted md:block">{[title?.format, title?.imprint].filter(Boolean).join(" · ")}</div>
      <div className="w-40 shrink-0 text-right">
        <div className="text-[13px] text-ink-2">
          {item.daysToPub === null ? "No pub date" : item.daysToPub === 0 ? "Publishes today" : `Publishes in ${item.daysToPub} days`}
        </div>
        <div className="num text-[11px] text-subtle">{fmtDate(item.pubDate, "")}</div>
      </div>
    </RowShell>
  );
}

function ChangedRow({ item, title, onOpen }: { item: ChangedTitle; title?: TitleSummaryRow; onOpen: () => void }) {
  const people = item.people.map((p) => p.name.split(" ")[0]);
  const who = people.length <= 2 ? people.join(" and ") : `${people.slice(0, 2).join(", ")} and ${people.length - 2} more`;
  return (
    <RowShell onOpen={onOpen}>
      <TitleCell title={title} isbn={item.isbn} />
      <div className="hidden -space-x-1.5 md:flex">
        {item.people.slice(0, 4).map((p) => (
          <span
            key={p.email}
            className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface"
            style={{ background: personColor(p.email) }}
            title={p.name}
          >
            {initials(p.name, p.email)}
          </span>
        ))}
      </div>
      <div className="w-56 shrink-0 text-right">
        <div className="text-[13px] text-ink-2">
          {who} · <span className="num">{fmtInt(item.changes)}</span> change{item.changes === 1 ? "" : "s"}
        </div>
        <div className="text-[11px] text-subtle">
          last {timeAgo(item.lastAt)} · {item.visitedAt ? `you last looked ${timeAgo(item.visitedAt)}` : "you haven't opened it"}
        </div>
      </div>
    </RowShell>
  );
}

/** Mentions and replies to my conversations. */
function Mentions() {
  const router = useRouter();
  const qc = useQueryClient();
  const list = useNotifications(true);
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api("/api/notifications/read", { method: "POST", json: body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      void qc.invalidateQueries({ queryKey: queryKeys.unread });
    },
  });

  if (list.isPending) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  const items = list.data?.items ?? [];
  if (!items.length) return <p className="px-6 py-16 text-center text-[13px] text-muted">No mentions yet. When someone @mentions you or replies to your comment, it shows up here.</p>;

  const go = (n: NotificationView) => {
    if (!n.readAt) read.mutate({ ids: [n._id] });
    router.push(`/titles/${n.isbn}?thread=${encodeURIComponent(n.threadKey)}`);
  };

  return (
    <div>
      {list.data?.unread ? (
        <div className="flex justify-end border-b border-line px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => read.mutate({ all: true })}>
            <CheckCheck />
            Mark all as read
          </Button>
        </div>
      ) : null}
      <ul className="divide-y divide-line/70">
        {items.map((n) => (
          <NotificationRow key={n._id} n={n} onOpen={() => go(n)} />
        ))}
      </ul>
    </div>
  );
}

export function NotificationRow({ n, onOpen, compact }: { n: NotificationView; onOpen: () => void; compact?: boolean }) {
  return (
    <li>
      <button type="button" onClick={onOpen} className={cn("flex w-full gap-3 text-left hover:bg-surface-2/60", compact ? "px-3 py-2" : "px-4 py-3")}>
        <span
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
          style={{ background: personColor(n.fromEmail) }}
        >
          {initials(n.fromName, n.fromEmail)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink">
            <span className="font-medium">{n.fromName}</span> {n.type === "mention" ? "mentioned you" : "replied"} on{" "}
            <span className="font-medium">{n.titleName}</span>
            <span className="text-muted"> · {n.rowLabel}</span>
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[13px] text-ink-2">{n.excerpt}</span>
          <span className="mt-0.5 block text-[11px] text-subtle">{timeAgo(n.createdAt)}</span>
        </span>
        {!n.readAt ? <span className="mt-2 size-2 shrink-0 rounded-full bg-info" aria-label="Unread" /> : null}
      </button>
    </li>
  );
}

