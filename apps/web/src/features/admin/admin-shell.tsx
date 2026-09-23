"use client";

import { LayoutGrid, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ADMIN_MODULES } from "./modules";

/** Admin console frame: modules and their pages on the left, the page on the right. */
export function AdminShell({ demoEnvironment, children }: { demoEnvironment: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const modules = ADMIN_MODULES.map((m) => ({
    ...m,
    pages: m.pages.filter(
      (p) =>
        (!p.demoOnly || demoEnvironment) &&
        (!needle || `${m.label} ${p.label} ${p.description}`.toLowerCase().includes(needle)),
    ),
  })).filter((m) => m.pages.length);

  return (
    <div className="flex min-h-0 flex-1">
      <nav aria-label="Admin console" className="scrollbar-thin flex w-[260px] shrink-0 flex-col overflow-y-auto border-r border-line bg-surface/60">
        <div className="sticky top-0 z-10 space-y-2 border-b border-line bg-surface/95 p-3 backdrop-blur">
          <Link
            href="/admin"
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] font-semibold",
              pathname === "/admin" ? "bg-brand-soft text-brand" : "text-ink hover:bg-surface-2",
            )}
          >
            <LayoutGrid className="size-4" />
            Admin console
          </Link>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a setting…"
              aria-label="Find a setting"
              className="h-7 w-full rounded-md border border-line bg-surface pl-7 pr-2 text-[12.5px] outline-none placeholder:text-subtle focus:border-line-strong"
            />
          </div>
        </div>
        <div className="flex flex-col gap-4 p-3">
          {modules.map((m) => (
            <div key={m.id}>
              <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <m.icon className="size-3.5" />
                {m.label}
              </div>
              <ul className="flex flex-col gap-0.5">
                {m.pages.map((p) => {
                  const href = `/admin/${p.slug}`;
                  const active = pathname === href;
                  return (
                    <li key={p.slug}>
                      <Link
                        href={href}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] transition-colors",
                          active ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <p.icon className="size-4 shrink-0" />
                        <span className="truncate">{p.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!modules.length ? <p className="px-2 text-[12.5px] text-muted">No setting matches “{q}”.</p> : null}
        </div>
      </nav>
      <div className="scrollbar-thin min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 pt-5 lg:px-8 lg:pt-7">{children}</div>
      </div>
    </div>
  );
}
