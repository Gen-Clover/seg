import { seasonSortKey } from "@seg/domain";
import type { TitleSummaryRow } from "@/lib/queries";
import { fmtDate } from "@/lib/utils";

/** Facet filters shown on the summary page (legacy: season, paper cut-off, LDC, division, imprint). */
export const FACETS = [
  { key: "season", label: "Season", get: (t: TitleSummaryRow) => t.season },
  { key: "division", label: "Division", get: (t: TitleSummaryRow) => t.division },
  { key: "imprint", label: "Imprint", get: (t: TitleSummaryRow) => t.imprint },
  { key: "format", label: "Format", get: (t: TitleSummaryRow) => t.format },
  { key: "pco", label: "Paper cut-off", get: (t: TitleSummaryRow) => t.paperCutOff },
  { key: "ldc", label: "LDC", get: (t: TitleSummaryRow) => t.ldc },
] as const;

export type FacetKey = (typeof FACETS)[number]["key"];

export interface SummaryFilters {
  facets: Record<FacetKey, string[]>;
  q: string;
  sort: string;
  dir: "asc" | "desc";
}

export const DEFAULT_SORT = { sort: "pubDate", dir: "asc" as const };

export function parseFilters(params: URLSearchParams): SummaryFilters {
  const facets = Object.fromEntries(
    FACETS.map((f) => [f.key, params.get(f.key)?.split("|").filter(Boolean) ?? []]),
  ) as Record<FacetKey, string[]>;
  return {
    facets,
    q: params.get("q") ?? "",
    sort: params.get("sort") ?? DEFAULT_SORT.sort,
    dir: params.get("dir") === "desc" ? "desc" : params.get("dir") === "asc" ? "asc" : DEFAULT_SORT.dir,
  };
}

export function serializeFilters(f: SummaryFilters): string {
  const p = new URLSearchParams();
  for (const facet of FACETS) if (f.facets[facet.key].length) p.set(facet.key, f.facets[facet.key].join("|"));
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.sort !== DEFAULT_SORT.sort || f.dir !== DEFAULT_SORT.dir) {
    p.set("sort", f.sort);
    p.set("dir", f.dir);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const activeFilterCount = (f: SummaryFilters) =>
  FACETS.reduce((n, facet) => n + (f.facets[facet.key].length ? 1 : 0), 0) + (f.q.trim() ? 1 : 0);

function matchesText(t: TitleSummaryRow, words: string[]) {
  if (!words.length) return true;
  const hay = `${t.isbn} ${t.title} ${t.author ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function matchesFacets(t: TitleSummaryRow, f: SummaryFilters, skip?: FacetKey) {
  for (const facet of FACETS) {
    if (facet.key === skip) continue;
    const selected = f.facets[facet.key];
    if (selected.length && !selected.includes(facet.get(t) ?? "")) return false;
  }
  return true;
}

export function applyFilters(titles: TitleSummaryRow[], f: SummaryFilters): TitleSummaryRow[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  return titles.filter((t) => matchesText(t, words) && matchesFacets(t, f));
}

/** Options for one facet, counted against every OTHER active filter (cascading filters). */
export function facetOptions(titles: TitleSummaryRow[], f: SummaryFilters, key: FacetKey) {
  const facet = FACETS.find((x) => x.key === key)!;
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const counts = new Map<string, number>();
  for (const t of titles) {
    const v = facet.get(t);
    if (!v) continue;
    if (!counts.has(v)) counts.set(v, 0);
    if (matchesText(t, words) && matchesFacets(t, f, key)) counts.set(v, counts.get(v)! + 1);
  }
  const isDate = key === "pco" || key === "ldc";
  const options = [...counts].map(([value, count]) => ({ value, label: isDate ? fmtDate(value) : value, count }));
  if (key === "season") options.sort((a, b) => seasonSortKey(a.value) - seasonSortKey(b.value));
  else if (isDate) options.sort((a, b) => b.value.localeCompare(a.value));
  else options.sort((a, b) => a.label.localeCompare(b.label));
  // Keep relevant options on top; the rest stay available below.
  return [...options.filter((o) => o.count > 0 || f.facets[key].includes(o.value)), ...options.filter((o) => o.count === 0 && !f.facets[key].includes(o.value))];
}
