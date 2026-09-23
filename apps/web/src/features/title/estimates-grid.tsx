"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronRight, CornerDownRight, MessageSquare, Pencil } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  NOT_DEFINED_CHANNEL_LABEL,
  parseEstimateInput,
  type EstimateField,
  type EstimateNumberField,
  type TitleGrid,
} from "@seg/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { Popover, PopoverAnchor, PopoverContent, Tooltip } from "@/components/ui/overlay";
import { clockTime } from "@/lib/people";
import { usePersonName } from "@/lib/queries";
import { cn, fmtInt } from "@/lib/utils";
import {
  GRID_COLS,
  cellId,
  childSum,
  flattenGrid,
  rowLevel,
  rowMetrics,
  rowOwn,
  rowRef,
  rowRolled,
  type GridCol,
  type GridRow,
} from "./grid-model";
import type { CellConflict } from "./use-autosave";

/** A cell another person just changed (flashes briefly). */
export interface RemoteChange {
  by: string;
  at: string;
}

/** Someone else editing a cell right now. */
export interface OtherEditor {
  name: string;
  initials: string;
  color: string;
}

const ROW_H = 40;
const HEADER_H = 58;

export interface EstimatesGridHandle {
  focusRow: (key: string) => void;
}

interface Props {
  isbn: string;
  grid: TitleGrid;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  filter: string;
  canEdit: boolean;
  dirtyCells: Set<string>;
  savedCells: Set<string>;
  onEdit: (row: GridRow, field: EstimateField, value: number | string | null) => void;
  highlightKey?: string | null;
  conflicts: Map<string, CellConflict>;
  onResolve: (cellKey: string, choice: "mine" | "theirs") => void;
  remoteCells: Map<string, RemoteChange>;
  othersEditing: Map<string, OtherEditor>;
  /** Comment count per row thread (estimateId). */
  commentCounts: Map<string, number>;
  onOpenThread: (threadKey: string) => void;
  /** Reports the cell being edited ("<estimateId>|<field>") so others can see it. */
  onEditingChange: (cellKey: string | null) => void;
}

interface Active {
  r: number;
  c: number;
}

const templateColumns = GRID_COLS.map((c) => `${c.width}px`).join(" ");
/** Hint shown in an empty editable cell on hover or when selected. */
const EMPTY_HINT: Record<string, string> = {
  laydownGoal: "Add goal",
  laydownEstimate: "Add estimate",
  sixMonthEstimate: "Add estimate",
  salesNotes: "Add a note…",
};
/** Space kept below the rows for the horizontal scrollbar. */
const SCROLLBAR_ROOM = 12;
const gridWidth = GRID_COLS.reduce((s, c) => s + c.width, 0);
const editableCol = (col: GridCol) => col.kind === "estimate" || col.kind === "notes";

export const EstimatesGrid = forwardRef<EstimatesGridHandle, Props>(function EstimatesGrid(
  {
    isbn,
    grid,
    expanded,
    onToggle,
    filter,
    canEdit,
    dirtyCells,
    savedCells,
    onEdit,
    highlightKey,
    conflicts,
    onResolve,
    remoteCells,
    othersEditing,
    commentCounts,
    onOpenThread,
    onEditingChange,
  },
  ref,
) {
  const rows = useMemo(() => flattenGrid(grid, expanded, filter), [grid, expanded, filter]);
  const nameOf = usePersonName();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Active>({ r: 0, c: 2 });
  const [editing, setEditing] = useState<{ draft: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // rows[0] is the "All channels" total, pinned under the header; the rest is virtualized.
  const virtualizer = useVirtualizer({
    count: Math.max(0, rows.length - 1),
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: 14,
    scrollPaddingStart: HEADER_H + ROW_H,
  });
  const scrollToRow = (r: number, align: "auto" | "center") => {
    if (r > 0) virtualizer.scrollToIndex(r - 1, { align });
  };

  // Scroll state for the frozen-column shadow, the pinned-total shadow and the "more columns" fade.
  const [scroll, setScroll] = useState({ x: false, y: false, right: false });
  const readScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = { x: el.scrollLeft > 0, y: el.scrollTop > 0, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
    setScroll((prev) => (prev.x === next.x && prev.y === next.y && prev.right === next.right ? prev : next));
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => readScroll());
    ro.observe(el);
    return () => ro.disconnect();
  }, [readScroll]);

  useImperativeHandle(ref, () => ({
    focusRow: (key: string) => {
      const idx = rows.findIndex((r) => r.key === key);
      if (idx >= 0) {
        setActive((a) => ({ r: idx, c: a.c }));
        scrollToRow(idx, "center");
        scrollRef.current?.focus();
      }
    },
  }));

  // Keep the active cell inside the table when rows change.
  useEffect(() => {
    setActive((a) => (a.r >= rows.length ? { r: Math.max(0, rows.length - 1), c: a.c } : a));
  }, [rows.length]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const editingKey = editing && rows[active.r] && GRID_COLS[active.c]?.field ? cellId(isbn, rows[active.r]!, GRID_COLS[active.c]!.field!) : null;
  useEffect(() => {
    onEditingChange(editingKey);
  }, [editingKey, onEditingChange]);

  const isEditable = useCallback(
    (row: GridRow | undefined, col: GridCol | undefined) => !!row && !!col && canEdit && row.kind !== "total" && editableCol(col),
    [canEdit],
  );

  const cellValue = (row: GridRow, col: GridCol): string => {
    const own = rowOwn(row);
    if (col.kind === "notes") return own?.salesNotes ?? "";
    if (col.kind === "estimate" && col.field) {
      const v = own?.[col.field as EstimateNumberField];
      return v === null || v === undefined ? "" : String(v);
    }
    return "";
  };

  const move = (dr: number, dc: number) => {
    setActive((a) => {
      const r = Math.min(rows.length - 1, Math.max(0, a.r + dr));
      const c = Math.min(GRID_COLS.length - 1, Math.max(0, a.c + dc));
      scrollToRow(r, "auto");
      return { r, c };
    });
  };

  const commit = (draft: string, next?: [number, number]) => {
    const row = rows[active.r];
    const col = GRID_COLS[active.c];
    if (!row || !col?.field || !isEditable(row, col)) {
      setEditing(null);
      return;
    }
    if (col.kind === "estimate") {
      const parsed = parseEstimateInput(draft);
      if (parsed === undefined) {
        toast.error("Estimates are whole numbers, like 1200.", { id: "grid-number" });
        return;
      }
      if (String(parsed ?? "") !== cellValue(row, col)) onEdit(row, col.field, parsed);
    } else if (draft.trim() !== cellValue(row, col)) {
      onEdit(row, col.field, draft.trim());
    }
    setEditing(null);
    if (next) move(next[0], next[1]);
    scrollRef.current?.focus();
  };

  const startEdit = (initial?: string) => {
    const row = rows[active.r];
    const col = GRID_COLS[active.c];
    if (!isEditable(row, col)) return;
    setEditing({ draft: initial ?? cellValue(row!, col!) });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing) return; // handled by the input
    const row = rows[active.r];
    const col = GRID_COLS[active.c];
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return move(1, 0);
      case "ArrowUp":
        e.preventDefault();
        return move(-1, 0);
      case "ArrowRight":
        e.preventDefault();
        if (col?.kind === "name" && row && row.kind !== "total" && row.kind !== "account" && !expanded.has(row.key)) return onToggle(row.key);
        return move(0, 1);
      case "ArrowLeft":
        e.preventDefault();
        if (col?.kind === "name" && row && expanded.has(row.key)) return onToggle(row.key);
        return move(0, -1);
      case "Tab":
        e.preventDefault();
        return move(0, e.shiftKey ? -1 : 1);
      case "Home":
        e.preventDefault();
        return setActive((a) => ({ r: mod ? 0 : a.r, c: 0 }));
      case "End":
        e.preventDefault();
        return setActive((a) => ({ r: mod ? rows.length - 1 : a.r, c: GRID_COLS.length - 1 }));
      case "PageDown":
        e.preventDefault();
        return move(15, 0);
      case "PageUp":
        e.preventDefault();
        return move(-15, 0);
      case "Enter":
      case "F2":
        e.preventDefault();
        if (col?.kind === "name" && row && row.kind !== "total") return onToggle(row.key);
        return startEdit();
      case " ":
        if (col?.kind === "name" && row && row.kind !== "total") {
          e.preventDefault();
          return onToggle(row.key);
        }
        break;
      case "Delete":
      case "Backspace":
        if (isEditable(row, col) && col?.field) {
          e.preventDefault();
          if (cellValue(row!, col) !== "") onEdit(row!, col.field, col.kind === "notes" ? "" : null);
        }
        return;
    }
    if (mod && e.key.toLowerCase() === "c" && row && col) {
      const text = col.kind === "name" ? rowLabel(row) : col.kind === "metric" && col.metric ? String(rowMetrics(row)[col.metric] ?? "") : cellValue(row, col);
      void navigator.clipboard?.writeText(text);
      return;
    }
    if (!mod && !e.altKey && e.key.length === 1 && isEditable(row, col)) {
      if (col!.kind === "estimate" && !/[0-9]/.test(e.key)) return;
      e.preventDefault();
      startEdit(e.key);
    }
  };

  /** Paste a block copied from Excel (tab/newline separated) starting at the active cell. */
  const onPaste = (e: React.ClipboardEvent) => {
    if (editing || !canEdit) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    let applied = 0;
    let rejected = 0;
    lines.forEach((cells, i) => {
      const row = rows[active.r + i];
      cells.forEach((raw, j) => {
        const col = GRID_COLS[active.c + j];
        if (!row || !col?.field || !isEditable(row, col)) return;
        if (col.kind === "estimate") {
          const v = parseEstimateInput(raw);
          if (v === undefined) return void rejected++;
          onEdit(row, col.field, v);
        } else onEdit(row, col.field, raw.trim());
        applied++;
      });
    });
    if (applied) toast.success(`Pasted ${applied} cell${applied === 1 ? "" : "s"}${rejected ? ` · ${rejected} skipped (not whole numbers)` : ""}`);
  };

  const activeRow = rows[active.r];

  const renderRow = (index: number, layout: { pinned: true } | { start: number; size: number }) => {
    const row = rows[index]!;
    const isActiveRow = index === active.r;
    const pinned = "pinned" in layout;
    return (
      <div
        key={row.key}
        role="row"
        aria-rowindex={index + 1}
        className={cn(
          "group grid w-full border-b text-[13px]",
          pinned
            ? "sticky z-[15] border-b-2 border-line-strong bg-[var(--row-total)] font-semibold transition-shadow"
            : "absolute left-0",
          pinned && scroll.y && "shadow-[0_4px_8px_-4px_hsl(var(--shadow-color)/0.25)]",
          row.kind === "channel" && "border-line-strong bg-surface font-medium",
          row.kind === "org" && "border-line-strong/80 bg-surface",
          row.kind === "account" && "border-line-strong/70 bg-[var(--row-account)]",
          !pinned && "hover:bg-[var(--row-hover)]",
          !pinned && isActiveRow && "bg-[var(--row-active)] hover:bg-[var(--row-active)]",
          highlightKey === row.key && "animate-pulse bg-brand-soft",
        )}
        style={
          pinned
            ? { gridTemplateColumns: templateColumns, height: ROW_H, top: HEADER_H }
            : { gridTemplateColumns: templateColumns, height: layout.size, transform: `translateY(${layout.start}px)` }
        }
      >
        {GRID_COLS.map((col, ci) => {
          const isActive = isActiveRow && ci === active.c;
          const key = col.field ? (cellId(isbn, row, col.field) ?? "") : "";
          const thread = col.kind === "name" ? threadKeyOf(isbn, row) : null;
          return (
            <Cell
              key={col.key}
              isbn={isbn}
              row={row}
              col={col}
              hasComp={grid.hasComp}
              active={isActive}
              activeRow={isActiveRow}
              highlighted={highlightKey === row.key}
              frozenShadow={scroll.x}
              editable={isEditable(row, col)}
              expanded={expanded.has(row.key)}
              onToggle={onToggle}
              dirty={key ? dirtyCells.has(key) : false}
              saved={key ? savedCells.has(key) : false}
              conflict={key ? conflicts.get(key) : undefined}
              onResolve={(choice) => onResolve(key, choice)}
              remote={key ? remoteCells.get(key) : undefined}
              other={key ? othersEditing.get(key) : undefined}
              comments={thread ? (commentCounts.get(thread) ?? 0) : 0}
              onOpenThread={thread ? () => onOpenThread(thread) : undefined}
              nameOf={nameOf}
              onMouseDown={() => {
                if (editing && !isActive) commit(editing.draft);
                setActive({ r: index, c: ci });
              }}
              onDoubleClick={() => {
                setActive({ r: index, c: ci });
                if (isEditable(row, col)) setEditing({ draft: cellValue(row, col) });
                else if (col.kind === "name" && row.kind !== "total") onToggle(row.key);
              }}
            >
              {isActive && editing ? (
                <input
                  ref={inputRef}
                  value={editing.draft}
                  inputMode={col.kind === "estimate" ? "numeric" : "text"}
                  onChange={(e) => setEditing({ draft: col.kind === "estimate" ? e.target.value.replace(/[^0-9,]/g, "") : e.target.value })}
                  onBlur={() => commit(editing.draft)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commit(editing.draft, [e.shiftKey ? -1 : 1, 0]);
                    } else if (e.key === "Tab") {
                      e.preventDefault();
                      commit(editing.draft, [0, e.shiftKey ? -1 : 1]);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditing(null);
                      scrollRef.current?.focus();
                    }
                  }}
                  className={cn(
                    "absolute inset-0 z-10 h-full w-full rounded-[3px] bg-surface px-2.5 text-[13px] text-ink outline-none ring-2 ring-info",
                    col.kind === "estimate" && "num text-right",
                  )}
                />
              ) : null}
            </Cell>
          );
        })}
      </div>
    );
  };

  // As tall as the rows need (so the horizontal scrollbar sits right under them), up to the screen height.
  const contentHeight = HEADER_H + rows.length * ROW_H + SCROLLBAR_ROOM;

  return (
    <div className="relative" style={{ height: `min(${contentHeight}px, calc(100vh - 170px))`, minHeight: Math.min(contentHeight, 240) }}>
      <div
        ref={scrollRef}
        tabIndex={0}
        role="grid"
        aria-rowcount={rows.length}
        aria-colcount={GRID_COLS.length}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onScroll={readScroll}
        className="scrollbar-thin relative h-full overflow-auto outline-none"
      >
        <div style={{ width: gridWidth, minWidth: "100%" }}>
          <GridHeader hasComp={grid.hasComp} frozenShadow={scroll.x} />
          {rows.length ? renderRow(0, { pinned: true }) : null}
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => renderRow(item.index + 1, { start: item.start, size: item.size }))}
          </div>
        </div>
        {activeRow && activeRow.kind !== "total" ? <span className="sr-only" aria-live="polite">{rowLabel(activeRow)}</span> : null}
      </div>
      {/* More columns to the right. */}
      <div
        className={cn(
          "pointer-events-none absolute bottom-3 right-0 top-0 w-10 bg-gradient-to-l from-surface to-transparent transition-opacity",
          scroll.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
});

/** Comment thread of a row: its estimate id (the same key the history log uses). */
function threadKeyOf(isbn: string, row: GridRow): string | null {
  const id = cellId(isbn, row, "salesNotes");
  return id ? id.slice(0, id.lastIndexOf("|")) : null;
}

function rowLabel(row: GridRow): string {
  if (row.kind === "total") return "All channels";
  if (row.kind === "channel") return row.node.ref.channelName ?? NOT_DEFINED_CHANNEL_LABEL;
  if (row.kind === "org") return row.node.ref.orgName ?? row.node.ref.orgId ?? "No organization";
  return row.node.ref.accountName ?? row.node.ref.accountId ?? "";
}

function GridHeader({ hasComp, frozenShadow }: { hasComp: boolean; frozenShadow: boolean }) {
  const firstComp = GRID_COLS.findIndex((c) => c.comp);
  return (
    <div className="sticky top-0 z-20 border-b border-line-strong bg-surface-2/95 backdrop-blur" style={{ height: HEADER_H }}>
      <div className="grid h-[22px] text-[11px] font-medium uppercase tracking-wide text-subtle" style={{ gridTemplateColumns: templateColumns }}>
        <div className={cn("sticky left-0 z-10 border-r border-line-strong bg-surface-2", frozenShadow && FROZEN_SHADOW)} />
        <div style={{ gridColumn: `2 / span ${firstComp - 1}` }} className="flex items-end border-b-2 border-line-strong px-3 text-ink-2">
          This title
        </div>
        <div style={{ gridColumn: `${firstComp + 1} / -1` }} className="flex items-end border-b-2 border-l border-b-info/50 border-l-line-strong bg-info-soft/40 px-3 text-ink-2">
          {hasComp ? "Comparable title" : "Comparable title · none selected"}
        </div>
      </div>
      <div className="grid h-9 text-[12.5px] font-semibold leading-tight text-ink-2" style={{ gridTemplateColumns: templateColumns }}>
        {GRID_COLS.map((c, i) => {
          const editable = c.kind === "estimate" || c.kind === "notes";
          return (
            <Tooltip key={c.key} content={editable ? "Editable – click a cell to enter a value" : (c.short ?? null)}>
              <div
                className={cn(
                  "flex items-center gap-1 border-r border-line-strong/70 px-3",
                  c.kind !== "name" && c.kind !== "notes" && "justify-end text-right",
                  c.kind === "name" && cn("sticky left-0 z-10 border-r-line-strong bg-surface-2", frozenShadow && FROZEN_SHADOW),
                  editable && "bg-[var(--edit-head)]",
                  c.comp && "bg-info-soft/40",
                  i === firstComp && "border-l border-line-strong",
                  c.comp && !hasComp && "text-subtle",
                )}
              >
                {editable ? <Pencil className="size-3 shrink-0 text-info" aria-hidden /> : null}
                <span className="line-clamp-2">{c.label}</span>
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

interface CellProps {
  isbn: string;
  row: GridRow;
  col: GridCol;
  hasComp: boolean;
  active: boolean;
  activeRow: boolean;
  highlighted: boolean;
  frozenShadow: boolean;
  editable: boolean;
  expanded: boolean;
  dirty: boolean;
  saved: boolean;
  conflict?: CellConflict;
  onResolve: (choice: "mine" | "theirs") => void;
  remote?: RemoteChange;
  other?: OtherEditor;
  comments: number;
  onOpenThread?: () => void;
  nameOf: (email: string | null | undefined) => string;
  onToggle: (key: string) => void;
  onMouseDown: () => void;
  onDoubleClick: () => void;
  children?: React.ReactNode;
}

function Cell({
  row,
  col,
  hasComp,
  active,
  activeRow,
  highlighted,
  frozenShadow,
  editable,
  expanded,
  dirty,
  saved,
  conflict,
  onResolve,
  remote,
  other,
  comments,
  onOpenThread,
  nameOf,
  onToggle,
  onMouseDown,
  onDoubleClick,
  children,
}: CellProps) {
  const firstComp = col.comp && GRID_COLS.find((c) => c.comp)?.key === col.key;
  const isName = col.kind === "name";
  const base = cn(
    "group/cell relative flex min-w-0 items-center border-r border-line-strong/70 px-3 transition-[background,box-shadow] duration-300",
    // Frozen first column: solid background, above every scrolling cell (SEG-001).
    isName && "sticky left-0 z-[5] border-r-line-strong",
    isName &&
      (highlighted
        ? "bg-brand-soft"
        : row.kind === "total"
          ? "bg-[var(--row-total)]"
          : activeRow
            ? "bg-[var(--row-active)]"
            : cn(row.kind === "account" ? "bg-[var(--row-account)]" : "bg-surface", "group-hover:bg-[var(--row-hover)]")),
    isName && frozenShadow && FROZEN_SHADOW,
    col.kind !== "name" && col.kind !== "notes" && "justify-end",
    firstComp && "border-l border-line",
    editable && "cursor-cell bg-[var(--edit-tint)] hover:bg-[color-mix(in_srgb,var(--info)_9%,transparent)]",
    dirty && "bg-warn-soft/70",
    saved && "bg-ok-soft",
    remote && "bg-info-soft",
    conflict && "bg-warn-soft shadow-[inset_0_0_0_1.5px_var(--warn)]",
    // Selection is blue; red/amber are kept for problems.
    active && !isName && "z-[3] shadow-[inset_0_0_0_2px_var(--info)]",
    active && isName && "shadow-[inset_0_0_0_2px_var(--info)]",
  );
  const hint = editable && col.field ? EMPTY_HINT[col.field] : undefined;

  let content: React.ReactNode = null;
  if (col.kind === "name") content = <NameCell row={row} expanded={expanded} onToggle={onToggle} comments={comments} onOpenThread={onOpenThread} />;
  else if (col.kind === "metric" && col.metric) {
    const v = rowMetrics(row)[col.metric];
    content = (
      <span className={cn("num", col.comp && !hasComp ? "text-subtle/60" : row.kind === "account" ? "text-ink-2" : "text-ink", v === 0 && "text-subtle")}>
        {col.comp && !hasComp ? "—" : fmtInt(v, "—")}
      </span>
    );
  } else if (col.kind === "estimate" && col.field) {
    content = <EstimateCell row={row} field={col.field as EstimateNumberField} hint={hint} active={active} />;
  } else if (col.kind === "notes") {
    const notes = rowOwn(row)?.salesNotes ?? "";
    content = notes ? (
      <Tooltip content={notes.length > 38 ? notes : null}>
        <span className="truncate text-ink-2">{notes}</span>
      </Tooltip>
    ) : (
      <EmptyValue hint={hint} active={active} />
    );
  }

  const cell = (
    <div
      role="gridcell"
      className={base}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      style={other ? { boxShadow: `inset 0 0 0 2px ${other.color}` } : undefined}
    >
      {conflict ? <AlertTriangle className="mr-auto size-3.5 shrink-0 text-warn" aria-label="Conflict" /> : null}
      {editable && !conflict ? (
        <Pencil className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-info opacity-0 transition-opacity group-hover/cell:opacity-60" aria-hidden />
      ) : null}
      {remote ? (
        <Tooltip content={`Changed by ${nameOf(remote.by)} · ${clockTime(remote.at)}`}>
          <span className="flex min-w-0 items-center">{content}</span>
        </Tooltip>
      ) : (
        content
      )}
      {other ? (
        <span
          className="pointer-events-none absolute -top-px right-0 z-[2] rounded-bl px-1 text-[9px] font-semibold leading-3 text-white"
          style={{ background: other.color }}
          title={`${other.name} is editing`}
        >
          {other.initials}
        </span>
      ) : null}
      {children}
    </div>
  );

  if (!conflict) return cell;
  return (
    <Popover open={active}>
      <PopoverAnchor asChild>{cell}</PopoverAnchor>
      <PopoverContent side="bottom" align="end" className="w-72 p-3" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
        <p className="text-[13px] text-ink">
          <span className="font-medium">{nameOf(conflict.changedBy)}</span> changed this to{" "}
          <span className="num font-semibold">{fmtCell(conflict.current)}</span>
          {conflict.changedAt ? <> at {clockTime(conflict.changedAt)}</> : null}. You entered{" "}
          <span className="num font-semibold">{fmtCell(conflict.yours)}</span>.
        </p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="brand" className="flex-1" onMouseDown={(e) => e.preventDefault()} onClick={() => onResolve("mine")}>
            Keep mine ({fmtCell(conflict.yours)})
          </Button>
          <Button size="sm" className="flex-1" onMouseDown={(e) => e.preventDefault()} onClick={() => onResolve("theirs")}>
            Use theirs ({fmtCell(conflict.current)})
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const fmtCell = (v: number | string | null) => (v === null || v === "" ? "blank" : typeof v === "number" ? fmtInt(v) : `“${v.length > 40 ? v.slice(0, 40) + "…" : v}”`);

/** Empty cell: a faint dash everywhere; editable cells show what to enter on hover or when selected. */
function EmptyValue({ hint, active }: { hint?: string; active: boolean }) {
  if (!hint) return <span className="text-subtle/60">—</span>;
  return (
    <>
      <span className={cn("text-subtle/60 group-hover/cell:hidden", active && "hidden")}>—</span>
      <span className={cn("hidden text-xs font-normal text-info/80 group-hover/cell:inline", active && "inline")}>{hint}</span>
    </>
  );
}

function EstimateCell({ row, field, hint, active }: { row: GridRow; field: EstimateNumberField; hint?: string; active: boolean }) {
  const own = rowOwn(row)?.[field] ?? null;
  const rolled = rowRolled(row)[field];
  if (row.kind === "total") {
    // Re-keyed on change so the total briefly flashes when it moves.
    return rolled === null ? (
      <EmptyValue active={false} />
    ) : (
      <span key={rolled} className="num -mx-1 animate-flash rounded px-1">
        {fmtInt(rolled)}
      </span>
    );
  }
  if (own !== null) {
    const sum = childSum(row, field);
    const overrides = sum !== null && sum !== own;
    return (
      <span className="flex items-center gap-1.5">
        {overrides ? (
          <Tooltip content={`Overrides ${row.kind === "channel" ? "organization" : "account"} total of ${fmtInt(sum)}`}>
            <span className="size-1.5 rounded-full bg-info" aria-label="Override" />
          </Tooltip>
        ) : null}
        <span className="num font-medium text-ink">{fmtInt(own)}</span>
      </span>
    );
  }
  if (rolled !== null) {
    return (
      <Tooltip content={`Total of ${row.kind === "channel" ? "organizations" : "accounts"} — type to override`}>
        <span className="num italic text-subtle">{fmtInt(rolled)}</span>
      </Tooltip>
    );
  }
  return <EmptyValue hint={hint} active={active} />;
}

const FROZEN_SHADOW = "shadow-[6px_0_8px_-6px_hsl(var(--shadow-color)/0.3)]";

function NameCell({
  row,
  expanded,
  onToggle,
  comments,
  onOpenThread,
}: {
  row: GridRow;
  expanded: boolean;
  onToggle: (key: string) => void;
  comments: number;
  onOpenThread?: () => void;
}) {
  if (row.kind === "total") {
    return (
      <span className="flex items-center gap-2">
        <span className="text-ink">All channels</span>
      </span>
    );
  }
  const canExpand = row.kind === "channel" ? row.node.orgs.length > 0 : row.kind === "org" ? row.channel.accountLevel && row.node.accounts.length > 0 : false;
  const indent = row.depth * 20;
  const title = rowLabel(row);
  const id = row.kind === "channel" ? row.node.ref.channelId : row.kind === "org" ? row.node.ref.orgId : row.node.ref.accountId;

  return (
    <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: indent }}>
      {canExpand ? (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => onToggle(row.key)}
          className="-ml-1 rounded p-0.5 text-muted hover:bg-surface-3 hover:text-ink"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
        </button>
      ) : row.kind === "account" ? (
        <CornerDownRight className="size-3.5 shrink-0 text-subtle" />
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className={cn("truncate", row.kind === "channel" && !row.node.ref.channelId && "italic text-muted")}>{title}</span>
      {id && row.kind !== "channel" ? <span className="num shrink-0 text-xs text-subtle">{id}</span> : null}
      {row.kind === "channel" ? (
        <span className="ml-auto shrink-0 text-[11px] text-subtle">
          {row.node.orgs.length} org{row.node.orgs.length === 1 ? "" : "s"}
          {row.node.accountLevel ? ` · ${row.node.accountCount} acct` : ""}
        </span>
      ) : null}
      {row.kind === "org" && row.channel.accountLevel && row.node.accountCount ? (
        <span className="ml-auto shrink-0 text-[11px] text-subtle">{row.node.accountCount} acct</span>
      ) : null}
      {row.kind === "account" && row.node.compOnly ? (
        <Badge tone="info" className="ml-auto shrink-0">
          Comp only
        </Badge>
      ) : null}
      {onOpenThread ? (
        <Tooltip content={comments ? `${comments} comment${comments === 1 ? "" : "s"}` : "Comment on this row"}>
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onOpenThread}
            className={cn(
              "flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] hover:bg-surface-3",
              comments ? "text-info" : "text-subtle opacity-0 group-hover:opacity-100",
              !(row.kind === "channel" || (row.kind === "org" && row.channel.accountLevel && row.node.accountCount) || (row.kind === "account" && row.node.compOnly)) && "ml-auto",
            )}
            aria-label="Comments"
          >
            <MessageSquare className="size-3.5" />
            {comments ? <span className="num">{comments}</span> : null}
          </button>
        </Tooltip>
      ) : null}
    </span>
  );
}

export { rowLevel, rowRef };
