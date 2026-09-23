"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { usePrefetchTitle, type TitleSummaryRow } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { SUMMARY_COLUMNS, gridTemplate, totalWidth } from "./columns";

const ROW_HEIGHT = 50;

export function SummaryTable({
  rows,
  sort,
  dir,
  onSort,
}: {
  rows: TitleSummaryRow[];
  sort: string;
  dir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const prefetch = usePrefetchTitle();
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cols = SUMMARY_COLUMNS;
  const template = gridTemplate(cols);
  const width = totalWidth(cols);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const open = (isbn: string, newTab: boolean) => {
    if (newTab) window.open(`/titles/${isbn}`, "_blank");
    else router.push(`/titles/${isbn}`);
  };

  return (
    <div ref={parentRef} className="scrollbar-thin relative min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]">
      <div style={{ width, minWidth: "100%" }}>
        {/* Header */}
        <div
          role="row"
          className="sticky top-0 z-20 grid border-b border-line bg-surface-2/95 text-xs font-medium text-muted backdrop-blur"
          style={{ gridTemplateColumns: template }}
        >
          {cols.map((c) => {
            const active = sort === c.key;
            const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
            return (
              <button
                key={c.key}
                type="button"
                title={c.title}
                onClick={() => onSort(c.key)}
                className={cn(
                  "group flex h-10 items-center gap-1 px-3 text-left hover:text-ink",
                  c.align === "right" && "justify-end text-right",
                  c.sticky && "sticky left-0 z-10 bg-surface-2",
                  active && "text-ink",
                )}
              >
                <span className="truncate">{c.label}</span>
                <Icon className={cn("size-3.5 shrink-0", active ? "text-brand" : "text-subtle opacity-0 group-hover:opacity-100")} />
              </button>
            );
          })}
        </div>

        {/* Rows */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const t = rows[item.index]!;
            return (
              <div
                key={t.isbn}
                role="row"
                tabIndex={0}
                onClick={(e) => open(t.isbn, e.metaKey || e.ctrlKey)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open(t.isbn, e.metaKey || e.ctrlKey);
                }}
                onMouseEnter={() => {
                  if (hoverTimer.current) clearTimeout(hoverTimer.current);
                  hoverTimer.current = setTimeout(() => prefetch(t.isbn), 120);
                }}
                onMouseLeave={() => hoverTimer.current && clearTimeout(hoverTimer.current)}
                className="group absolute left-0 grid w-full cursor-pointer items-center border-b border-line/70 text-[13px] outline-none transition-colors hover:bg-surface-2/70 focus-visible:bg-brand-soft/60"
                style={{ gridTemplateColumns: template, height: item.size, transform: `translateY(${item.start}px)` }}
              >
                {cols.map((c) => (
                  <div
                    key={c.key}
                    className={cn(
                      "flex h-full min-w-0 items-center px-3",
                      c.align === "right" && "justify-end text-right",
                      c.sticky && "sticky left-0 z-10 bg-surface group-hover:bg-surface-2 group-focus-visible:bg-brand-soft",
                    )}
                  >
                    {c.render(t)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
