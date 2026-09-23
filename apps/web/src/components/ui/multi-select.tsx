"use client";

import { Command } from "cmdk";
import { Check, ChevronDown, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./overlay";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Number of matching items given the other active filters. */
  count?: number;
}

/** Filter chip that opens a searchable checklist. */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchPlaceholder = "Search…",
  className,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const set = new Set(selected);
  const toggle = (value: string) => onChange(set.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const summary =
    selected.length === 0
      ? null
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${selected.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "group inline-flex h-8 max-w-[240px] items-center gap-1.5 rounded-lg border px-2.5 text-[13px] shadow-sm transition-colors",
            selected.length
              ? "border-info/40 bg-info-soft text-ink"
              : "border-line-strong bg-surface text-ink-2 hover:border-ink/25 hover:bg-surface-2",
            className,
          )}
        >
          <span className={cn("font-medium", selected.length && "text-info")}>{label}</span>
          {summary ? (
            <>
              <span className="h-3.5 w-px bg-brand-line" />
              <span className="truncate">{summary}</span>
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Clear ${label}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange([]);
                }}
                className="-mr-1 rounded p-0.5 text-muted hover:bg-brand-line/50 hover:text-ink"
              >
                <X className="size-3.5" />
              </span>
            </>
          ) : (
            <ChevronDown className="size-3.5 text-subtle transition-transform group-data-[state=open]:rotate-180" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <Command loop>
          <div className="border-b border-line p-1.5">
            <Command.Input
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md bg-transparent px-2 text-[13px] outline-none placeholder:text-subtle"
            />
          </div>
          <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-6 text-center text-xs text-muted">No matches</Command.Empty>
            {options.map((o) => {
              const checked = set.has(o.value);
              return (
                <Command.Item
                  key={o.value}
                  value={`${o.label} ${o.value}`}
                  onSelect={() => toggle(o.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] data-[selected=true]:bg-surface-2"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded border",
                      checked ? "border-brand bg-brand text-white" : "border-line-strong",
                    )}
                  >
                    {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className={cn("flex-1 truncate", o.count === 0 && !checked && "text-subtle")}>{o.label}</span>
                  {o.count !== undefined ? <span className="num text-xs text-subtle">{o.count}</span> : null}
                </Command.Item>
              );
            })}
          </Command.List>
          {selected.length ? (
            <div className="border-t border-line p-1">
              <button
                type="button"
                onClick={() => onChange([])}
                className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted hover:bg-surface-2 hover:text-ink"
              >
                Clear selection
              </button>
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
