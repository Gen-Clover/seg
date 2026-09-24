"use client";

import { Command } from "cmdk";
import { ExternalLink, Repeat2, Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Spinner } from "@/components/ui/misc";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlay";
import { useTitleSearch, type TitleDetail } from "@/lib/queries";
import { fmtDate, fmtInt, fmtMoney } from "@/lib/utils";

export function CompPanel({
  isbn,
  comp,
  canEdit,
  saving,
  onChange,
}: {
  isbn: string;
  comp: TitleDetail["comp"];
  canEdit: boolean;
  saving: boolean;
  onChange: (compIsbn: string | null) => void;
}) {
  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div>
          <h3 className="text-[13px] font-semibold">Comparable title</h3>
          <p className="text-xs text-muted">Its sales show next to each account in the grid.</p>
        </div>
        <div className="flex items-center gap-1.5">
          {saving ? <Spinner className="text-muted" /> : null}
          {canEdit ? <CompPicker isbn={isbn} hasComp={!!comp} onPick={onChange} /> : null}
          {canEdit && comp ? (
            <Tooltip content="Remove comparable title">
              <Button variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label="Remove comparable title">
                <X />
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
      {comp ? (
        <div className="grid flex-1 gap-3 p-4">
          <div className="min-w-0">
            {/* A real link in a new tab: the current title (and the user's place in the grid) stays open. */}
            <Tooltip content="Open in new tab">
              <a
                href={`/titles/${comp.isbn}`}
                target="_blank"
                rel="noopener"
                className="inline-flex max-w-full items-center gap-1.5 text-[15px] font-semibold text-ink underline-offset-2 hover:text-info hover:underline"
              >
                <span className="truncate">{comp.title}</span>
                <ExternalLink className="size-3.5 shrink-0 text-muted" />
              </a>
            </Tooltip>
            <p className="num truncate text-xs text-muted">
              {comp.isbn} · {comp.author ?? "—"} · {comp.season ?? "—"}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="LTD sales" value={fmtInt(comp.stats.ltdGrossUnits)} />
            <Stat label="eBook sales" value={fmtInt(comp.stats.ebookUnits)} />
            <Stat label="BookScan" value={fmtInt(comp.stats.bookscanLtd)} />
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <Row k="Pub date" v={fmtDate(comp.pubDate)} />
            <Row k="Release date" v={fmtDate(comp.releaseDate)} />
            <Row k="Format" v={comp.format ?? "—"} />
            <Row k="US price" v={fmtMoney(comp.usPrice)} />
            <Row k="Division" v={comp.division ?? "—"} />
            <Row k="Imprint" v={comp.imprint ?? "—"} />
          </dl>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">
            <Repeat2 className="size-5" />
          </div>
          <p className="text-[13px] font-medium">No comparable title</p>
          <p className="max-w-xs text-xs text-muted">
            Pick a similar past title to see its initial orders, gross and net sales by account.
          </p>
          {canEdit ? <CompPicker isbn={isbn} hasComp={false} onPick={onChange} primary /> : null}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2.5 py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="num text-[15px] font-semibold">{value}</div>
    </div>
  );
}

/** Label above value, left-aligned — the same layout as Title details. */
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-muted">{k}</dt>
      <dd className="num truncate text-ink">{v}</dd>
    </div>
  );
}

export function CompPicker({ isbn, hasComp, onPick, primary }: { isbn: string; hasComp: boolean; onPick: (isbn: string) => void; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const search = useTitleSearch(q);
  const results = (search.data?.results ?? []).filter((r) => r.isbn !== isbn);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={primary ? "primary" : "outline"} size="sm" className={primary ? "mt-2" : undefined}>
          <Search />
          {hasComp ? "Change" : "Choose title"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] p-0">
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search className="size-4 text-subtle" />
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder="Search the catalog by ISBN, title or author"
              className="h-10 flex-1 bg-transparent text-[13px] outline-none placeholder:text-subtle"
            />
            {search.isFetching ? <Spinner className="text-muted" /> : null}
          </div>
          <Command.List className="scrollbar-thin max-h-80 overflow-y-auto p-1">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-xs text-muted">Type at least 2 characters</p>
            ) : (
              <Command.Empty className="px-3 py-6 text-center text-xs text-muted">No titles found</Command.Empty>
            )}
            {results.map((r) => (
              <Command.Item
                key={r.isbn}
                value={r.isbn}
                onSelect={() => {
                  onPick(r.isbn);
                  setOpen(false);
                  setQ("");
                }}
                className="flex cursor-pointer flex-col rounded-md px-2.5 py-1.5 data-[selected=true]:bg-surface-2"
              >
                <span className="truncate text-[13px] font-medium">{r.title}</span>
                <span className="num truncate text-xs text-muted">
                  {r.isbn} · {r.author ?? "—"} · {r.season ?? "—"} · {r.format ?? "—"}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
