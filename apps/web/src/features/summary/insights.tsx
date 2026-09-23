"use client";

import { ArrowDownRight, ArrowUpRight, CalendarDays, Gauge, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { Card, Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/overlay";
import { useChannelInsights, useTrends, type TitleSummaryRow } from "@/lib/queries";
import { cn, fmtCompact, fmtInt, fmtSigned } from "@/lib/utils";

/** Section colours from abramsbooks.com's navigation, used for channels. */
export const ABRAMS_SERIES = ["#e91a23", "#c05700", "#0a7ca2", "#837600", "#1d7f47", "#2b5c9e", "#c15251", "#977001", "#78726b"];

const DAY = 86_400_000;
const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const daysUntil = (iso: string | null, today: string) => (iso ? Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / DAY) : null);

/* ---------------- Planning health ---------------- */

/** Five headline ratios for the titles in view. */
export function HealthStrip({ rows }: { rows: TitleSummaryRow[] }) {
  const h = useMemo(() => {
    const today = todayIso();
    let estimated = 0;
    let withComp = 0;
    let initial = 0;
    let estimate = 0;
    let goal = 0;
    let goalEstimate = 0;
    let atRisk = 0;
    for (const t of rows) {
      const { laydownGoal: g, laydownEstimate: e } = t.totals;
      if (e !== null) estimated++;
      if (t.compIsbn) withComp++;
      initial += t.totals.initialOrder;
      estimate += e ?? 0;
      if (g !== null && e !== null) {
        goal += g;
        goalEstimate += e;
      }
      const nearest = [t.paperCutOff, t.ldc].map((d) => daysUntil(d, today)).filter((d): d is number => d !== null && d >= 0);
      if (e === null && nearest.length && Math.min(...nearest) <= 30) atRisk++;
    }
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    return {
      estimated: pct(estimated, rows.length),
      withComp: pct(withComp, rows.length),
      toGoal: pct(goalEstimate, goal),
      sellIn: initial ? estimate / initial : null,
      atRisk,
    };
  }, [rows]);

  const items = [
    { label: "Titles estimated", value: h.estimated === null ? "—" : `${h.estimated}%`, sub: "have a laydown estimate", tip: "Share of titles in view with a laydown estimate." },
    { label: "With a comparable", value: h.withComp === null ? "—" : `${h.withComp}%`, sub: "have a comparable title", tip: "Comparable titles give each account a sales reference." },
    {
      label: "Estimate to goal",
      value: h.toGoal === null ? "—" : `${h.toGoal}%`,
      sub: "where both are set",
      tone: h.toGoal === null ? "" : h.toGoal < 95 ? "text-warn" : "text-ok",
      tip: "Laydown estimate as a share of laydown goal, counting titles that have both.",
    },
    {
      label: "Estimate ÷ initial orders",
      value: h.sellIn === null ? "—" : `${h.sellIn.toFixed(2)}×`,
      sub: "laydown vs pre-orders",
      tip: "Total laydown estimate divided by total initial orders. Above 1× means the team expects more than is already ordered.",
    },
    {
      label: "Deadlines at risk",
      value: fmtInt(h.atRisk),
      sub: "cut-off or LDC ≤ 30 days, no estimate",
      tone: h.atRisk ? "text-brand" : "text-ok",
      tip: "Titles whose paper cut-off or LDC is within 30 days and still have no laydown estimate.",
    },
  ];
  return (
    <Card className="grid grid-cols-2 divide-line md:grid-cols-5 md:divide-x">
      {items.map((i) => (
        <Tooltip key={i.label} content={i.tip}>
          <div className="cursor-help px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <Gauge className="size-3.5" />
              {i.label}
            </div>
            <div className={cn("num mt-1 text-[20px] font-semibold tracking-tight text-ink", i.tone)}>{i.value}</div>
            <div className="truncate text-xs text-subtle">{i.sub}</div>
          </div>
        </Tooltip>
      ))}
    </Card>
  );
}

/* ---------------- Channel mix ---------------- */

/** Where the units are: each channel's share of initial orders vs its share of the laydown estimate. */
export function ChannelMix({ rows }: { rows: TitleSummaryRow[] }) {
  const insights = useChannelInsights(true);
  const mix = useMemo(() => {
    const data = insights.data;
    if (!data) return null;
    const sums = data.channels.map(() => ({ initial: 0, goal: 0, estimate: 0 }));
    for (const r of rows) {
      const per = data.rows[r.isbn];
      if (!per) continue;
      per.forEach(([i, g, e], idx) => {
        sums[idx]!.initial += i;
        sums[idx]!.goal += g ?? 0;
        sums[idx]!.estimate += e ?? 0;
      });
    }
    const totalI = sums.reduce((a, s) => a + s.initial, 0);
    const totalE = sums.reduce((a, s) => a + s.estimate, 0);
    return data.channels
      .map((c, idx) => ({ name: c.name, ...sums[idx]!, iShare: totalI ? sums[idx]!.initial / totalI : 0, eShare: totalE ? sums[idx]!.estimate / totalE : 0 }))
      .filter((c) => c.initial || c.estimate)
      .sort((a, b) => b.estimate - a.estimate || b.initial - a.initial);
  }, [insights.data, rows]);

  return (
    <Card className="p-4">
      <h2 className="text-[14px] font-semibold">Channel mix</h2>
      <p className="text-xs text-muted">Share of initial orders vs share of laydown estimate, for the titles in view</p>
      {!mix ? (
        <Skeleton className="mt-3 h-56" />
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
            {(["iShare", "eShare"] as const).map((k) => (
              <div key={k} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[11px] text-muted">{k === "iShare" ? "Initial orders" : "Laydown est."}</span>
                <div className="flex h-4 flex-1 overflow-hidden rounded">
                  {mix.map((c, i) => (
                    <Tooltip key={c.name} content={`${c.name}: ${Math.round(c[k] * 100)}%`}>
                      <div style={{ width: `${c[k] * 100}%`, background: ABRAMS_SERIES[i % ABRAMS_SERIES.length] }} />
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <table className="mt-3 w-full text-[13px]">
            <thead className="text-[11px] text-muted">
              <tr className="border-b border-line">
                <th className="py-1.5 text-left font-medium">Channel</th>
                <th className="py-1.5 text-right font-medium">Initial orders</th>
                <th className="py-1.5 text-right font-medium">Laydown est.</th>
                <th className="py-1.5 text-right font-medium">Shift</th>
              </tr>
            </thead>
            <tbody>
              {mix.map((c, i) => {
                const shift = Math.round((c.eShare - c.iShare) * 100);
                return (
                  <tr key={c.name} className="border-b border-line/70 last:border-0">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-sm" style={{ background: ABRAMS_SERIES[i % ABRAMS_SERIES.length] }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                    </td>
                    <td className="num py-1.5 text-right text-ink-2">
                      {fmtCompact(c.initial)} <span className="text-[11px] text-subtle">{Math.round(c.iShare * 100)}%</span>
                    </td>
                    <td className="num py-1.5 text-right text-ink">
                      {fmtCompact(c.estimate)} <span className="text-[11px] text-subtle">{Math.round(c.eShare * 100)}%</span>
                    </td>
                    <td className={cn("num py-1.5 text-right text-xs", shift > 0 ? "text-ok" : shift < 0 ? "text-warn" : "text-subtle")}>
                      {shift ? `${shift > 0 ? "+" : ""}${shift} pts` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

/* ---------------- Publication calendar ---------------- */

/** The next six months of publications: titles, goal vs estimate, and how many still lack estimates. */
export function PubCalendar({ rows }: { rows: TitleSummaryRow[] }) {
  const months = useMemo(() => {
    const now = new Date();
    const out: { key: string; label: string; titles: number; goal: number; estimate: number; missing: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        titles: 0,
        goal: 0,
        estimate: 0,
        missing: 0,
      });
    }
    const byKey = new Map(out.map((m) => [m.key, m]));
    for (const t of rows) {
      const m = t.pubDate ? byKey.get(t.pubDate.slice(0, 7)) : undefined;
      if (!m) continue;
      m.titles++;
      m.goal += t.totals.laydownGoal ?? 0;
      m.estimate += t.totals.laydownEstimate ?? 0;
      if (t.totals.laydownEstimate === null) m.missing++;
    }
    return out;
  }, [rows]);
  const max = Math.max(1, ...months.map((m) => Math.max(m.goal, m.estimate)));

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
        <CalendarDays className="size-4 text-muted" />
        Publication calendar
      </h2>
      <p className="text-xs text-muted">Titles publishing in the next six months (in view)</p>
      <div className="mt-4 grid grid-cols-6 items-end gap-3">
        {months.map((m) => (
          <Tooltip key={m.key} content={`${m.titles} titles · goal ${fmtInt(m.goal)} · estimate ${fmtInt(m.estimate)}${m.missing ? ` · ${m.missing} without estimate` : ""}`}>
            <div className="flex cursor-help flex-col items-center gap-1.5">
              <div className="flex h-32 w-full items-end justify-center gap-1">
                <div className="w-3 rounded-t border-2 border-ink-2/35" style={{ height: `${(m.goal / max) * 100}%` }} />
                <div className="w-3 rounded-t bg-brand" style={{ height: `${(m.estimate / max) * 100}%` }} />
              </div>
              <div className="text-xs font-medium text-ink">{m.label}</div>
              <div className="num text-[11px] text-muted">{m.titles} titles</div>
              <div className={cn("num text-[11px]", m.missing ? "text-warn" : "text-subtle")}>{m.missing ? `${m.missing} missing` : "all estimated"}</div>
            </div>
          </Tooltip>
        ))}
      </div>
    </Card>
  );
}

/* ---------------- Movers and gaps ---------------- */

function TitleList({ items }: { items: { isbn: string; title: string; right: React.ReactNode; sub: string }[] }) {
  if (!items.length) return <p className="py-8 text-center text-[13px] text-muted">Nothing to show for the titles in view.</p>;
  return (
    <ol className="mt-2 divide-y divide-line">
      {items.map((i, n) => (
        <li key={i.isbn}>
          <Link href={`/titles/${i.isbn}`} className="group flex items-center gap-3 py-2 hover:bg-surface-2/60">
            <span className="num w-5 shrink-0 text-right text-xs text-subtle">{n + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ink group-hover:text-info">{i.title}</span>
              <span className="num block truncate text-[11px] text-muted">{i.sub}</span>
            </span>
            {i.right}
          </Link>
        </li>
      ))}
    </ol>
  );
}

/** Titles whose laydown estimate moved most since the start of this week. */
export function Movers({ rows }: { rows: TitleSummaryRow[] }) {
  const trends = useTrends(true);
  const items = useMemo(() => {
    const t = trends.data;
    if (!t) return null;
    const last = t.points.length - 2; // start of this week (the final point is "now")
    return rows
      .map((r) => {
        const s = t.series[r.isbn];
        const before = s ? (s[1][last] ?? 0) : 0;
        return { r, delta: (r.totals.laydownEstimate ?? 0) - before };
      })
      .filter((x) => x.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8)
      .map(({ r, delta }) => ({
        isbn: r.isbn,
        title: r.title,
        sub: `${r.isbn} · now ${fmtInt(r.totals.laydownEstimate)}`,
        right: (
          <span className={cn("num flex items-center gap-0.5 text-[13px] font-semibold", delta > 0 ? "text-ok" : "text-warn")}>
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {fmtSigned(delta)}
          </span>
        ),
      }));
  }, [trends.data, rows]);
  return (
    <Card className="p-4">
      <h2 className="text-[14px] font-semibold">Biggest movers this week</h2>
      <p className="text-xs text-muted">Change in laydown estimate since Monday</p>
      {items ? <TitleList items={items} /> : <Skeleton className="mt-3 h-48" />}
    </Card>
  );
}

/** Titles furthest below their laydown goal. */
export function Gaps({ rows }: { rows: TitleSummaryRow[] }) {
  const items = useMemo(
    () =>
      rows
        .filter((r) => r.totals.laydownGoal !== null && r.totals.laydownEstimate !== null && r.totals.laydownEstimate < r.totals.laydownGoal)
        .map((r) => ({ r, gap: r.totals.laydownGoal! - r.totals.laydownEstimate! }))
        .sort((a, b) => b.gap - a.gap)
        .slice(0, 8)
        .map(({ r, gap }) => ({
          isbn: r.isbn,
          title: r.title,
          sub: `${r.isbn} · ${Math.round((r.totals.laydownEstimate! / r.totals.laydownGoal!) * 100)}% of goal`,
          right: <span className="num text-[13px] font-semibold text-warn">−{fmtInt(gap)}</span>,
        })),
    [rows],
  );
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-1.5 text-[14px] font-semibold">
        <TrendingDown className="size-4 text-muted" />
        Largest gaps to goal
      </h2>
      <p className="text-xs text-muted">Laydown estimate furthest below goal</p>
      <TitleList items={items} />
    </Card>
  );
}
