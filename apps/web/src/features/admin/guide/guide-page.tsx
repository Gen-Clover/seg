"use client";

import { BookOpen, Download, Lightbulb, Search, TriangleAlert, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { GUIDE, GUIDE_SECTIONS, sectionText, type GuideBlock, type GuideSection } from "./content";
import { PageHeader } from "../ui";

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Text with **bold** runs and search matches highlighted. */
function Rich({ text, q }: { text: string; q: string }) {
  const clean = text.replace(/\\\*/g, "*");
  const parts = clean.split("**");
  const re = q ? new RegExp(`(${escapeRe(q)})`, "ig") : null;
  const mark = (s: string, key: string) =>
    re
      ? s.split(re).map((piece, i) =>
          i % 2 === 1 ? (
            <mark key={`${key}-${i}`} className="rounded-sm bg-warn-soft px-0.5 text-ink ring-1 ring-warn/40">
              {piece}
            </mark>
          ) : (
            <Fragment key={`${key}-${i}`}>{piece}</Fragment>
          ),
        )
      : s;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-ink">
            {mark(p, `b${i}`)}
          </strong>
        ) : (
          <Fragment key={i}>{mark(p, `t${i}`)}</Fragment>
        ),
      )}
    </>
  );
}

function Block({ b, q }: { b: GuideBlock; q: string }) {
  switch (b.t) {
    case "p":
      return (
        <p className="text-[14px] leading-relaxed text-ink-2">
          <Rich text={b.text} q={q} />
        </p>
      );
    case "h":
      return (
        <h3 className="pt-2 text-[15px] font-semibold text-ink">
          <Rich text={b.text} q={q} />
        </h3>
      );
    case "list":
      return (
        <ul className="ml-1 space-y-1.5 text-[14px] leading-relaxed text-ink-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand/70" aria-hidden />
              <span>
                <Rich text={it} q={q} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-2 text-[14px] leading-relaxed text-ink-2">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-3">
              <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-semibold text-white">{i + 1}</span>
              <span>
                <Rich text={it} q={q} />
              </span>
            </li>
          ))}
        </ol>
      );
    case "tip": {
      const Icon = b.tone === "warn" ? TriangleAlert : Lightbulb;
      return (
        <div className={cn("flex gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed", b.tone === "warn" ? "border-warn/30 bg-warn-soft" : "border-info/25 bg-info-soft")}>
          <Icon className={cn("mt-0.5 size-4 shrink-0", b.tone === "warn" ? "text-warn" : "text-info")} />
          <span className="text-ink-2">
            <Rich text={b.text} q={q} />
          </span>
        </div>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-[13.5px]">
            <thead className="bg-surface-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
              <tr>
                {b.head.map((h) => (
                  <th key={h} className="px-3.5 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-t border-line align-top">
                  {r.map((c, j) => (
                    <td key={j} className={cn("px-3.5 py-2 leading-relaxed", j === 0 ? "font-medium text-ink" : "text-ink-2")}>
                      <Rich text={c} q={q} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** Blocks of a section that contain the search text (all blocks when not searching). */
function visibleBlocks(s: GuideSection, q: string): GuideBlock[] {
  if (!q) return s.blocks;
  const needle = q.toLowerCase();
  if (s.title.toLowerCase().includes(needle)) return s.blocks;
  return s.blocks.filter((b) => sectionText({ ...s, title: "", blocks: [b] }).toLowerCase().includes(needle));
}

/** Admin console → System → Product guide: the full product description and user guide. */
export function ProductGuidePage() {
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState(GUIDE_SECTIONS[0]!.id);
  const [downloading, setDownloading] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const query = q.trim();

  const results = useMemo(() => {
    const needle = query.toLowerCase();
    return GUIDE_SECTIONS.map((s) => {
      const text = sectionText(s).toLowerCase();
      const hits = needle ? text.split(needle).length - 1 : 0;
      return { s, hits, blocks: visibleBlocks(s, query) };
    }).filter((r) => !query || r.hits > 0);
  }, [query]);
  const totalHits = results.reduce((n, r) => n + r.hits, 0);
  const parts = [...new Set(results.map((r) => r.s.part))];

  // Highlight the section being read in the contents.
  useEffect(() => {
    const els = container.current?.querySelectorAll<HTMLElement>("[data-guide-section]");
    if (!els?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveId(top.target.getAttribute("data-guide-section")!);
      },
      { rootMargin: "-10% 0px -75% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [results]);

  const go = (id: string) => {
    document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  const download = async () => {
    setDownloading(true);
    const id = toast.loading("Preparing the PDF…");
    try {
      const { downloadGuidePdf } = await import("./pdf");
      const res = await downloadGuidePdf(GUIDE, GUIDE_SECTIONS);
      toast.success(`Product guide downloaded · ${res.pages} pages`, { id });
    } catch (err) {
      console.error(err);
      toast.error("The PDF could not be created. Please try again.", { id });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={BookOpen}
        title="Product guide"
        description={
          <>
            Everything about SEG — what it does, how to use every screen, and how to run it. Version {GUIDE.version} · updated {GUIDE.updated}.
          </>
        }
        actions={
          <Button variant="brand" onClick={() => void download()} disabled={downloading} data-testid="guide-pdf">
            {downloading ? <Spinner className="size-3.5" /> : <Download />}
            Download PDF
          </Button>
        }
      />

      <div className="grid gap-6 pb-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the guide…"
              aria-label="Search the guide"
              className="h-9 w-full rounded-lg border border-line bg-surface pl-8 pr-8 text-[13px] shadow-sm outline-none placeholder:text-subtle focus:border-line-strong focus:ring-2 focus:ring-ring/20"
              data-testid="guide-search"
            />
            {q ? (
              <button type="button" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          {query ? (
            <p className="mt-2 text-xs text-muted" data-testid="guide-hits">
              {totalHits ? `${totalHits} match${totalHits === 1 ? "" : "es"} in ${results.length} section${results.length === 1 ? "" : "s"}` : "No matches"}
            </p>
          ) : null}
          <nav aria-label="Guide contents" className="scrollbar-thin mt-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {parts.map((p) => (
              <div key={p} className="mb-3">
                <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{p}</div>
                {results
                  .filter((r) => r.s.part === p)
                  .map((r) => (
                    <button
                      key={r.s.id}
                      type="button"
                      onClick={() => go(r.s.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]",
                        activeId === r.s.id ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <span className="truncate">{r.s.title}</span>
                      {query ? <span className="num rounded-full bg-warn-soft px-1.5 text-[11px] text-warn">{r.hits}</span> : null}
                    </button>
                  ))}
              </div>
            ))}
          </nav>
        </aside>

        <div ref={container} className="min-w-0 space-y-10" data-testid="guide-body">
          {!results.length ? (
            <div className="rounded-xl border border-line bg-surface px-6 py-16 text-center text-[13px] text-muted">Nothing in the guide matches “{query}”.</div>
          ) : null}
          {parts.map((part) => (
            <div key={part} className="space-y-4">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">{part}</div>
              {results
                .filter((r) => r.s.part === part)
                .map(({ s, blocks }) => (
                  <section key={s.id} id={`guide-${s.id}`} data-guide-section={s.id} className="scroll-mt-4 space-y-3.5 rounded-2xl border border-line bg-surface px-6 py-5 shadow-[var(--shadow-card)]">
                    <h2 className="text-[20px] font-semibold tracking-tight">
                      <Rich text={s.title} q={query} />
                    </h2>
                    {blocks.map((b, j) => (
                      <Block key={j} b={b} q={query} />
                    ))}
                    {query && blocks.length < s.blocks.length ? (
                      <button type="button" onClick={() => setQ("")} className="text-xs font-medium text-info hover:underline">
                        Showing the matching parts — clear the search to read the whole section
                      </button>
                    ) : null}
                  </section>
                ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
