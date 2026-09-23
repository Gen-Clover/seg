"use client";

import { BarChart3, FilterX, Search, Table2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Input, Skeleton } from "@/components/ui/misc";
import { MultiSelect } from "@/components/ui/multi-select";
import { useSummary, type TitleSummaryRow } from "@/lib/queries";
import { cn, fmtCompact, fmtInt, fmtSigned } from "@/lib/utils";
import { setWorklist } from "@/lib/worklist";
import { sortTitles } from "./columns";
import {
  FACETS,
  activeFilterCount,
  applyFilters,
  facetOptions,
  parseFilters,
  serializeFilters,
  type FacetKey,
  type SummaryFilters,
} from "./filters";
import { SummaryActions } from "./summary-actions";
import { SummaryTable } from "./summary-table";
import { useLocalPref } from "@/lib/use-local-pref";

// Loaded only when the dashboard is opened.
const SummaryDashboard = dynamic(() => import("./dashboard").then((m) => m.SummaryDashboard), {
  loading: () => <Card className="h-[420px] animate-pulse" />,
});

export function SummaryView() {
  const summary = useSummary();
  const params = useSearchParams();
  const pathname = usePathname();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);
  const [search, setSearch] = useState(filters.q);

  const update = useCallback(
    (next: SummaryFilters) => {
      // History update without a server round-trip; useSearchParams stays in sync.
      window.history.replaceState(null, "", pathname + serializeFilters(next));
    },
    [pathname],
  );

  // Debounce free-text search into the URL.
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => update({ ...filters, q: search }), 120);
    return () => clearTimeout(t);
  }, [search, filters, update]);

  const titles = useMemo(() => summary.data?.titles ?? [], [summary.data]);
  const filtered = useMemo(() => applyFilters(titles, filters), [titles, filters]);
  const rows = useMemo(() => sortTitles(filtered, filters.sort, filters.dir), [filtered, filters.sort, filters.dir]);

  useEffect(() => {
    if (!summary.data) return;
    setWorklist({
      isbns: rows.map((r) => r.isbn),
      label: activeFilterCount(filters) ? "Filtered titles" : "All titles",
      href: pathname + serializeFilters(filters),
    });
  }, [rows, filters, pathname, summary.data]);

  const setFacet = (key: FacetKey, values: string[]) => update({ ...filters, facets: { ...filters.facets, [key]: values } });
  const onSort = (key: string) =>
    update({ ...filters, sort: key, dir: filters.sort === key && filters.dir === "asc" ? "desc" : "asc" });
  const clearAll = () => {
    setSearch("");
    update({ ...filters, q: "", facets: Object.fromEntries(FACETS.map((f) => [f.key, []])) as unknown as SummaryFilters["facets"] });
  };
  const active = activeFilterCount(filters);
  const [view, setView] = useLocalPref("seg-summary-view", "table");

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4 p-5 lg:p-6", view === "dashboard" && "overflow-y-auto")}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Summary</h1>
          <p className="text-[13px] text-muted">
            Front-list titles with initial orders and laydown totals.{" "}
            {summary.data ? <span className="num">{fmtInt(titles.length)} titles in scope.</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 items-center rounded-lg border border-line-strong bg-surface p-0.5 text-xs shadow-sm" role="tablist" aria-label="View">
            {([
              ["table", "Table", Table2],
              ["dashboard", "Dashboard", BarChart3],
            ] as const).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                onClick={() => setView(key)}
                className={cn("flex items-center gap-1 rounded-md px-2 py-1 font-medium", view === key ? "bg-ink text-surface" : "text-muted hover:text-ink")}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <SummaryActions rows={rows} filters={filters} disabled={!summary.data} />
        </div>
      </header>

      <Kpis rows={filtered} loading={summary.isPending} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ISBN, title or author"
            className="pl-8 pr-7"
            aria-label="Search titles"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {FACETS.map((f) => (
          <MultiSelect
            key={f.key}
            label={f.label}
            options={facetOptions(titles, filters, f.key)}
            selected={filters.facets[f.key]}
            onChange={(v) => setFacet(f.key, v)}
          />
        ))}
        {active ? (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-muted">
            <FilterX />
            Clear all
          </Button>
        ) : null}
        <span className="num ml-auto text-xs text-muted">
          {summary.data ? `${fmtInt(rows.length)} of ${fmtInt(titles.length)}` : ""}
        </span>
      </div>

      {summary.isPending ? (
        <TableSkeleton />
      ) : summary.isError ? (
        <Card className="p-10 text-center text-[13px] text-muted">
          Couldn&apos;t load titles. <button className="text-brand underline" onClick={() => summary.refetch()}>Try again</button>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-14 text-center">
          <p className="text-[15px] font-medium">No titles match these filters</p>
          <p className="text-[13px] text-muted">Try removing a filter or searching for something else.</p>
          <Button className="mt-2" onClick={clearAll}>Clear filters</Button>
        </Card>
      ) : (
        view === "dashboard" ? (
          <SummaryDashboard rows={rows} />
        ) : (
          <SummaryTable rows={rows} sort={filters.sort} dir={filters.dir} onSort={onSort} />
        )
      )}
    </div>
  );
}

function Kpis({ rows, loading }: { rows: TitleSummaryRow[]; loading: boolean }) {
  const t = useMemo(() => {
    let initial = 0;
    let goal = 0;
    let estimate = 0;
    let planned = 0;
    for (const r of rows) {
      initial += r.totals.initialOrder;
      goal += r.totals.laydownGoal ?? 0;
      estimate += r.totals.laydownEstimate ?? 0;
      if (r.totals.laydownGoal !== null || r.totals.laydownEstimate !== null) planned++;
    }
    return { initial, goal, estimate, planned, gap: goal - estimate };
  }, [rows]);

  const items = [
    { label: "Titles", value: fmtInt(rows.length), sub: `${fmtInt(t.planned)} with estimates` },
    { label: "Initial orders", value: fmtCompact(t.initial), sub: "units, pre-publication" },
    { label: "Laydown goal", value: fmtCompact(t.goal), sub: "units" },
    { label: "Laydown estimate", value: fmtCompact(t.estimate), sub: t.goal ? `${Math.round((t.estimate / t.goal) * 100)}% of goal` : "units" },
    {
      label: "Estimate vs goal",
      value: fmtSigned(-t.gap),
      sub: t.gap > 0 ? "below goal" : t.gap < 0 ? "above goal" : "on goal",
      tone: t.gap > 0 ? "text-warn" : t.gap < 0 ? "text-ok" : "",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map((k) => (
        <Card key={k.label} className="px-4 py-3">
          <div className="text-xs font-medium text-muted">{k.label}</div>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-20" />
          ) : (
            <div className={cn("num mt-1 text-[22px] font-semibold tracking-tight", k.tone)}>{k.value}</div>
          )}
          <div className="mt-0.5 truncate text-xs text-subtle">{loading ? " " : k.sub}</div>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <Card className="flex-1 overflow-hidden">
      <div className="h-10 border-b border-line bg-surface-2" />
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex h-[50px] items-center gap-6 border-b border-line/70 px-3">
          <div className="w-64 space-y-1.5">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          {Array.from({ length: 8 }).map((__, j) => (
            <Skeleton key={j} className="h-3.5 w-16" />
          ))}
        </div>
      ))}
    </Card>
  );
}
