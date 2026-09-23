import type { TitleSummaryRow } from "@/lib/queries";
import { cn, fmtDate, fmtDateShort, fmtInt, fmtMoney, fmtSigned } from "@/lib/utils";

export interface SummaryColumn {
  key: string;
  label: string;
  width: number;
  align?: "right";
  sticky?: boolean;
  value: (t: TitleSummaryRow) => string | number | null;
  render: (t: TitleSummaryRow) => React.ReactNode;
  title?: string;
}

const dateCell = (iso: string | null) => <span className="num text-ink-2" title={fmtDate(iso, "")}>{fmtDateShort(iso)}</span>;

/** Key figures come right after the title so they are visible without scrolling. */
export const SUMMARY_COLUMNS: SummaryColumn[] = [
  {
    key: "title",
    label: "Title",
    width: 290,
    sticky: true,
    value: (t) => t.title.toLowerCase(),
    render: (t) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{t.title}</div>
        <div className="num truncate text-xs text-muted">
          {t.isbn}
          {t.author ? <span className="text-subtle"> · {t.author}</span> : null}
        </div>
      </div>
    ),
  },
  { key: "season", label: "Season", width: 104, value: (t) => t.seasonSort, render: (t) => <span className="text-ink-2">{t.season}</span> },
  {
    key: "initialOrder",
    label: "Initial orders",
    width: 112,
    align: "right",
    value: (t) => t.totals.initialOrder,
    render: (t) => <span className="num font-medium text-ink">{fmtInt(t.totals.initialOrder)}</span>,
  },
  {
    key: "laydownGoal",
    label: "Laydown goal",
    width: 112,
    align: "right",
    value: (t) => t.totals.laydownGoal,
    render: (t) => <span className="num text-ink">{fmtInt(t.totals.laydownGoal)}</span>,
  },
  {
    key: "laydownEstimate",
    label: "Laydown estimate",
    width: 112,
    align: "right",
    value: (t) => t.totals.laydownEstimate,
    render: (t) => <span className="num text-ink">{fmtInt(t.totals.laydownEstimate)}</span>,
  },
  {
    key: "estimateVsGoal",
    label: "Goal vs estimate",
    title: "Laydown goal minus laydown estimate",
    width: 108,
    align: "right",
    value: (t) => t.totals.estimateVsGoal,
    render: (t) => {
      const v = t.totals.estimateVsGoal;
      return (
        <span className={cn("num", v === null ? "text-subtle" : v > 0 ? "text-warn" : v < 0 ? "text-ok" : "text-ink-2")}>
          {fmtSigned(v)}
        </span>
      );
    },
  },
  {
    key: "division",
    label: "Division / Imprint",
    width: 180,
    value: (t) => `${t.division} ${t.imprint}`.toLowerCase(),
    render: (t) => (
      <div className="min-w-0 leading-tight">
        <div className="truncate text-ink-2">{t.imprint}</div>
        <div className="truncate text-xs text-muted">{t.division}</div>
      </div>
    ),
  },
  { key: "format", label: "Format", width: 128, value: (t) => t.format, render: (t) => <span className="truncate text-ink-2">{t.format}</span> },
  { key: "usPrice", label: "Price", width: 80, align: "right", value: (t) => t.usPrice, render: (t) => <span className="num text-ink-2">{fmtMoney(t.usPrice)}</span> },
  { key: "pubDate", label: "Pub date", width: 90, align: "right", value: (t) => t.pubDate, render: (t) => dateCell(t.pubDate) },
  { key: "releaseDate", label: "Release date", width: 88, align: "right", value: (t) => t.releaseDate, render: (t) => dateCell(t.releaseDate) },
  { key: "paperCutOff", label: "Paper cut-off", title: "Paper cut-off date", width: 88, align: "right", value: (t) => t.paperCutOff, render: (t) => dateCell(t.paperCutOff) },
  { key: "ldc", label: "LDC", width: 88, align: "right", value: (t) => t.ldc, render: (t) => dateCell(t.ldc) },
];

export const gridTemplate = (cols: SummaryColumn[]) => cols.map((c) => `${c.width}px`).join(" ");
export const totalWidth = (cols: SummaryColumn[]) => cols.reduce((s, c) => s + c.width, 0);

export function sortTitles(rows: TitleSummaryRow[], key: string, dir: "asc" | "desc"): TitleSummaryRow[] {
  const col = SUMMARY_COLUMNS.find((c) => c.key === key) ?? SUMMARY_COLUMNS.find((c) => c.key === "pubDate")!;
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = col.value(a);
    const vb = col.value(b);
    if (va === vb) return a.isbn.localeCompare(b.isbn);
    if (va === null || va === undefined || va === "") return 1; // blanks last
    if (vb === null || vb === undefined || vb === "") return -1;
    return (va < vb ? -1 : 1) * factor;
  });
}
