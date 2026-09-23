"use client";

import { useMemo, useState } from "react";
import { seasonSortKey } from "@seg/domain";
import { Card, Skeleton } from "@/components/ui/misc";
import { useTrends, type TitleSummaryRow } from "@/lib/queries";
import { cn, fmtCompact, fmtDate, fmtInt, fmtSigned } from "@/lib/utils";

type Dimension = "season" | "division" | "imprint" | "format";
const DIMENSIONS: { key: Dimension; label: string; get: (t: TitleSummaryRow) => string | null }[] = [
  { key: "season", label: "Season", get: (t) => t.season },
  { key: "division", label: "Division", get: (t) => t.division },
  { key: "imprint", label: "Imprint", get: (t) => t.imprint },
  { key: "format", label: "Format", get: (t) => t.format },
];

const COLORS = { goal: "var(--ink-2)", estimate: "var(--brand)", six: "var(--info)" };

/** Season dashboard for the titles in view: goal vs estimate by group, coverage, and week-by-week movement. */
export function SummaryDashboard({ rows }: { rows: TitleSummaryRow[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
      <GroupChart rows={rows} />
      <div className="flex flex-col gap-4">
        <Coverage rows={rows} />
        <WeeklyChart rows={rows} />
      </div>
    </div>
  );
}

/* ---------------- Goal vs estimate by group ---------------- */

function GroupChart({ rows }: { rows: TitleSummaryRow[] }) {
  const [dim, setDim] = useState<Dimension>("season");
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => {
    const get = DIMENSIONS.find((d) => d.key === dim)!.get;
    const by = new Map<string, { label: string; goal: number; estimate: number; titles: number; estimated: number }>();
    for (const t of rows) {
      const label = get(t) ?? "Not set";
      const g = by.get(label) ?? { label, goal: 0, estimate: 0, titles: 0, estimated: 0 };
      g.goal += t.totals.laydownGoal ?? 0;
      g.estimate += t.totals.laydownEstimate ?? 0;
      g.titles += 1;
      if (t.totals.laydownEstimate !== null) g.estimated += 1;
      by.set(label, g);
    }
    const list = [...by.values()];
    if (dim === "season") list.sort((a, b) => seasonSortKey(a.label) - seasonSortKey(b.label));
    else list.sort((a, b) => b.goal - a.goal || b.estimate - a.estimate);
    return list;
  }, [rows, dim]);
  const shown = showAll ? groups : groups.slice(0, 10);
  const max = Math.max(1, ...groups.map((g) => Math.max(g.goal, g.estimate)));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Laydown goal vs estimate</h2>
          <p className="text-xs text-muted">By {DIMENSIONS.find((d) => d.key === dim)!.label.toLowerCase()}, for the titles in view</p>
        </div>
        <Segmented value={dim} options={DIMENSIONS.map((d) => ({ value: d.key, label: d.label }))} onChange={(v) => setDim(v as Dimension)} />
      </div>
      <Legend items={[{ color: COLORS.goal, label: "Goal", outline: true }, { color: COLORS.estimate, label: "Estimate" }]} />
      <ul className="mt-3 space-y-2.5">
        {shown.map((g) => {
          const pct = g.goal ? Math.round((g.estimate / g.goal) * 100) : null;
          return (
            <li key={g.label} className="grid grid-cols-[140px_1fr_150px] items-center gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium text-ink" title={g.label}>
                  {g.label}
                </div>
                <div className="text-[11px] text-subtle">
                  {fmtInt(g.titles)} title{g.titles === 1 ? "" : "s"} · {Math.round((g.estimated / g.titles) * 100)}% estimated
                </div>
              </div>
              <div className="relative h-5">
                <div className="absolute inset-y-0 left-0 rounded-sm border-2" style={{ width: `${(g.goal / max) * 100}%`, borderColor: COLORS.goal, opacity: 0.35 }} />
                <div className="absolute inset-y-1 left-0 rounded-sm" style={{ width: `${(g.estimate / max) * 100}%`, background: COLORS.estimate }} />
              </div>
              <div className="num text-right text-xs">
                <span className="font-semibold text-ink">{fmtCompact(g.estimate)}</span>
                <span className="text-muted"> / {fmtCompact(g.goal)}</span>
                {pct !== null ? <span className={cn("ml-1.5 font-medium", pct < 100 ? "text-warn" : "text-ok")}>{pct}%</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
      {groups.length > 10 ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-medium text-info hover:underline">
          {showAll ? "Show top 10" : `Show all ${groups.length}`}
        </button>
      ) : null}
      {!groups.length ? <p className="py-10 text-center text-[13px] text-muted">No titles in view.</p> : null}
    </Card>
  );
}

/* ---------------- Coverage ---------------- */

function Coverage({ rows }: { rows: TitleSummaryRow[] }) {
  const c = useMemo(() => {
    let complete = 0;
    let partial = 0;
    let none = 0;
    let onGoal = 0;
    let below = 0;
    for (const t of rows) {
      const { laydownGoal: g, laydownEstimate: e, sixMonthEstimate: s } = t.totals;
      const filled = [g, e, s].filter((v) => v !== null).length;
      if (filled === 3) complete++;
      else if (filled) partial++;
      else none++;
      if (g !== null && e !== null) {
        if (e >= g) onGoal++;
        else below++;
      }
    }
    return { complete, partial, none, onGoal, below, total: rows.length };
  }, [rows]);
  const seg = (n: number) => `${c.total ? (n / c.total) * 100 : 0}%`;

  return (
    <Card className="p-4">
      <h2 className="text-[14px] font-semibold">Estimate coverage</h2>
      <p className="text-xs text-muted">How far planning has got for the titles in view</p>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-ok" style={{ width: seg(c.complete) }} title="Goal, laydown and 6-month all entered" />
        <div className="bg-warn" style={{ width: seg(c.partial) }} title="Some totals entered" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <Stat dot="bg-ok" label="Complete" value={c.complete} total={c.total} />
        <Stat dot="bg-warn" label="In progress" value={c.partial} total={c.total} />
        <Stat dot="bg-surface-3" label="Not started" value={c.none} total={c.total} />
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-xs text-muted">
        <span>
          <span className="num font-semibold text-ok">{fmtInt(c.onGoal)}</span> on or above goal
        </span>
        <span>
          <span className="num font-semibold text-warn">{fmtInt(c.below)}</span> below goal
        </span>
      </div>
    </Card>
  );
}

function Stat({ dot, label, value, total }: { dot: string; label: string; value: number; total: number }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted">
        <span className={cn("size-2 rounded-full", dot)} />
        {label}
      </div>
      <div className="num mt-0.5 text-[15px] font-semibold text-ink">
        {fmtInt(value)} <span className="text-xs font-normal text-subtle">{total ? Math.round((value / total) * 100) : 0}%</span>
      </div>
    </div>
  );
}

/* ---------------- Week by week ---------------- */

const W = 560;
const H = 200;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

function WeeklyChart({ rows }: { rows: TitleSummaryRow[] }) {
  const trends = useTrends(true);
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const t = trends.data;
    if (!t) return null;
    const n = t.points.length;
    const goal = new Array<number>(n).fill(0);
    const est = new Array<number>(n).fill(0);
    const six = new Array<number>(n).fill(0);
    for (const r of rows) {
      const s = t.series[r.isbn];
      if (!s) continue;
      for (let i = 0; i < n - 1; i++) {
        goal[i]! += s[0][i] ?? 0;
        est[i]! += s[1][i] ?? 0;
        six[i]! += s[2][i] ?? 0;
      }
    }
    // The last point is "now": use the live totals so the chart matches the table exactly.
    goal[n - 1] = rows.reduce((a, r) => a + (r.totals.laydownGoal ?? 0), 0);
    est[n - 1] = rows.reduce((a, r) => a + (r.totals.laydownEstimate ?? 0), 0);
    six[n - 1] = rows.reduce((a, r) => a + (r.totals.sixMonthEstimate ?? 0), 0);
    return { points: t.points, goal, est, six };
  }, [trends.data, rows]);

  if (trends.isPending || !data) {
    return (
      <Card className="p-4">
        <h2 className="text-[14px] font-semibold">Week by week</h2>
        <Skeleton className="mt-3 h-[200px]" />
      </Card>
    );
  }

  const n = data.points.length;
  const max = Math.max(1, ...data.goal, ...data.est, ...data.six);
  const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, n - 1);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const label = (i: number) => (i === n - 1 ? "Now" : fmtDate(data.points[i]!.slice(0, 10)).replace(/, \d{4}$/, ""));
  const h = hover ?? n - 1;
  const prev = Math.max(0, h - 1);
  const lines = [
    { key: "est", name: "Laydown estimate", color: COLORS.estimate, vals: data.est },
    { key: "goal", name: "Laydown goal", color: COLORS.goal, vals: data.goal },
    { key: "six", name: "6-month estimate", color: COLORS.six, vals: data.six },
  ];

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Week by week</h2>
          <p className="text-xs text-muted">Totals for the titles in view over the last {n - 1} weeks</p>
        </div>
        <span className="text-xs text-muted">{label(h)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {lines.map((l) => {
          const delta = l.vals[h]! - l.vals[prev]!;
          return (
            <div key={l.key}>
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-0.5 w-3 rounded" style={{ background: l.color }} />
                {l.name}
              </div>
              <div className="num text-[15px] font-semibold text-ink">{fmtInt(l.vals[h]!)}</div>
              {h > 0 ? <div className={cn("num text-[11px]", delta > 0 ? "text-ok" : delta < 0 ? "text-warn" : "text-subtle")}>{fmtSigned(delta)} vs prior week</div> : null}
            </div>
          );
        })}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full select-none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - box.left) / box.width) * W;
          const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1));
          setHover(Math.min(n - 1, Math.max(0, i)));
        }}
        role="img"
        aria-label="Weekly laydown goal, laydown estimate and 6-month estimate"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={10} fill="var(--subtle)">
              {fmtCompact(v)}
            </text>
          </g>
        ))}
        {data.points.map((_, i) =>
          i % 2 === (n - 1) % 2 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--subtle)">
              {label(i)}
            </text>
          ) : null,
        )}
        <line x1={x(h)} x2={x(h)} y1={PAD.t} y2={H - PAD.b} stroke="var(--line-strong)" strokeDasharray="3 3" />
        {lines.map((l) => (
          <g key={l.key}>
            <path d={path(l.vals)} fill="none" stroke={l.color} strokeWidth={l.key === "est" ? 2.25 : 1.5} strokeDasharray={l.key === "goal" ? "5 4" : undefined} />
            <circle cx={x(h)} cy={y(l.vals[h]!)} r={3.5} fill="var(--surface)" stroke={l.color} strokeWidth={2} />
          </g>
        ))}
      </svg>
    </Card>
  );
}

/* ---------------- Small pieces ---------------- */

function Segmented({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-surface-2/60 p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-2 py-1 font-medium", value === o.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { color: string; label: string; outline?: boolean }[] }) {
  return (
    <div className="mt-2 flex gap-4 text-[11px] text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm" style={i.outline ? { border: `2px solid ${i.color}`, opacity: 0.5 } : { background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
