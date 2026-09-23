"use client";

import { Command } from "cmdk";
import { BookOpen, CornerDownLeft, Search } from "lucide-react";
import { Dialog as D } from "radix-ui";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useSummary, useTitleSearch } from "@/lib/queries";
import { Kbd } from "../ui/misc";

const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });
export const useCommandPalette = () => useContext(PaletteContext);

/** ⌘K / Ctrl+K: jump to any title by ISBN, title or author. */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const summary = useSummary();
  const remote = useTitleSearch(open ? query : "");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const local = useMemo(() => {
    const q = query.trim().toLowerCase();
    const titles = summary.data?.titles ?? [];
    if (!q) return titles.slice(0, 8);
    const words = q.split(/\s+/);
    return titles
      .filter((t) => {
        const hay = `${t.isbn} ${t.title} ${t.author ?? ""} ${t.imprint ?? ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 12);
  }, [query, summary.data]);

  const localIsbns = new Set(local.map((t) => t.isbn));
  const others = (remote.data?.results ?? []).filter((r) => !localIsbns.has(r.isbn)).slice(0, 6);

  const go = (isbn: string) => {
    setOpen(false);
    setQuery("");
    router.push(`/titles/${isbn}`);
  };

  return (
    <PaletteContext.Provider value={{ open: () => setOpen(true) }}>
      {children}
      <D.Root open={open} onOpenChange={setOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/30 backdrop-blur-[2px]" />
          <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 animate-pop-in overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-pop)]">
            <D.Title className="sr-only">Find a title</D.Title>
            <Command shouldFilter={false} loop>
              <div className="flex items-center gap-2 border-b border-line px-4">
                <Search className="size-4 text-subtle" />
                <Command.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search by ISBN, title or author…"
                  className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
                />
                <Kbd>Esc</Kbd>
              </div>
              <Command.List className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
                <Command.Empty className="py-10 text-center text-[13px] text-muted">No titles found</Command.Empty>
                {local.length ? (
                  <Command.Group heading="Titles" className="text-[11px] font-medium text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                    {local.map((t) => (
                      <Item key={t.isbn} value={t.isbn} onSelect={() => go(t.isbn)} title={t.title} meta={`${t.isbn} · ${t.author ?? "—"} · ${t.season ?? ""}`} />
                    ))}
                  </Command.Group>
                ) : null}
                {others.length ? (
                  <Command.Group heading="Other catalog titles" className="mt-1 text-[11px] font-medium text-subtle [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">
                    {others.map((t) => (
                      <Item key={t.isbn} value={t.isbn} onSelect={() => go(t.isbn)} title={t.title} meta={`${t.isbn} · ${t.author ?? "—"} · ${t.season ?? ""}`} />
                    ))}
                  </Command.Group>
                ) : null}
              </Command.List>
            </Command>
          </D.Content>
        </D.Portal>
      </D.Root>
    </PaletteContext.Provider>
  );
}

function Item({ value, title, meta, onSelect }: { value: string; title: string; meta: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="group flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-ink data-[selected=true]:bg-surface-2"
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-surface-2 text-muted group-data-[selected=true]:bg-surface">
        <BookOpen className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className="block truncate text-xs text-muted">{meta}</span>
      </span>
      <CornerDownLeft className="size-3.5 text-subtle opacity-0 group-data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}
