"use client";

import { ChevronLeft, ChevronRight, GripVertical, Layers, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Tooltip } from "@/components/ui/overlay";
import { cn, fmtInt } from "@/lib/utils";

export interface DeskTab {
  id: string;
  label: string;
  count: number;
  /** A work group set up by an admin (shown with a small group icon). */
  group?: boolean;
}

/**
 * My Desk tab bar: drag a tab to reorder (the order is saved for the person), and arrows
 * appear to scroll through the tabs when they don't all fit.
 */
export function DeskTabs({
  tabs,
  active,
  onSelect,
  onReorder,
  onReset,
  trailing,
}: {
  tabs: DeskTab[];
  active: string;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  /** Shown when the person has a custom order. */
  onReset?: () => void;
  trailing?: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, tabs]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  // Keep the selected tab in view.
  useEffect(() => {
    scroller.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(active)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [active]);

  const scrollBy = (dir: -1 | 1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.6), behavior: "smooth" });
  };

  const drop = (targetId: string, after: boolean) => {
    if (!dragging || dragging === targetId) return;
    const ids = tabs.map((t) => t.id).filter((id) => id !== dragging);
    const at = ids.indexOf(targetId) + (after ? 1 : 0);
    ids.splice(at, 0, dragging);
    onReorder(ids);
  };

  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      onClick={() => scrollBy(dir)}
      aria-label={dir < 0 ? "Show earlier tabs" : "Show more tabs"}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-muted shadow-sm transition-opacity hover:text-ink",
        (dir < 0 ? edges.left : edges.right) ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      data-testid={dir < 0 ? "tabs-left" : "tabs-right"}
    >
      {dir < 0 ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
    </button>
  );

  return (
    <div className="flex items-center gap-1.5 border-b border-line px-2 pt-1">
      {edges.left || edges.right ? arrow(-1) : null}
      <div className="relative min-w-0 flex-1">
        <div
          ref={scroller}
          onScroll={measure}
          role="tablist"
          aria-label="My Desk lists"
          className="flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          data-testid="desk-tabs"
        >
          {tabs.map((t) => {
            const isOver = over?.id === t.id && dragging && dragging !== t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === t.id}
                data-tab-id={t.id}
                draggable
                onClick={() => onSelect(t.id)}
                onDragStart={(e) => {
                  setDragging(t.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", t.id);
                }}
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const after = e.clientX > r.left + r.width / 2;
                  if (over?.id !== t.id || over.after !== after) setOver({ id: t.id, after });
                }}
                onDragLeave={() => setOver((o) => (o?.id === t.id ? null : o))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (over) drop(over.id, over.after);
                  setDragging(null);
                  setOver(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                title="Drag to reorder"
                className={cn(
                  "group relative -mb-px flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 py-2.5 pl-1.5 pr-3 text-[13px] font-medium transition-colors",
                  active === t.id ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
                  dragging === t.id && "opacity-40",
                )}
              >
                {isOver ? <span className={cn("absolute inset-y-2 w-0.5 rounded bg-info", over!.after ? "-right-px" : "-left-px")} aria-hidden /> : null}
                <GripVertical className="size-3.5 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                {t.group ? <Layers className="size-3.5 shrink-0 text-info" aria-label="Work group" /> : null}
                {t.label}
                <span className="num rounded-full bg-surface-2 px-1.5 text-[11px] text-muted">{fmtInt(t.count)}</span>
              </button>
            );
          })}
        </div>
        {/* Fades hint that there is more to scroll to. */}
        <div className={cn("pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-surface to-transparent transition-opacity", edges.left ? "opacity-100" : "opacity-0")} />
        <div className={cn("pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-surface to-transparent transition-opacity", edges.right ? "opacity-100" : "opacity-0")} />
      </div>
      {edges.left || edges.right ? arrow(1) : null}
      {onReset ? (
        <Tooltip content="Reset tab order">
          <button type="button" onClick={onReset} className="flex size-7 shrink-0 items-center justify-center rounded-md text-subtle hover:bg-surface-2 hover:text-ink" aria-label="Reset tab order" data-testid="tabs-reset">
            <RotateCcw className="size-3.5" />
          </button>
        </Tooltip>
      ) : null}
      {trailing ? <div className="shrink-0 pb-1">{trailing}</div> : null}
    </div>
  );
}
