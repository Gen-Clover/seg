"use client";

import { ArrowRight, Bot, SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssistantReply } from "@/server/services/assistant";

type Turn = { id: number; from: "me"; text: string } | { id: number; from: "bot"; reply: AssistantReply };

const STORE = "seg-ask-abrams-assistant";
const load = (): Turn[] => {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Turn[];
  } catch {
    return [];
  }
};
const save = (turns: Turn[]) => {
  try {
    sessionStorage.setItem(STORE, JSON.stringify(turns.slice(-60)));
  } catch {
    // The conversation just won't survive a reload.
  }
};

const TONE: Record<string, string> = {
  ok: "text-ok",
  warn: "text-warn",
  brand: "text-brand",
  info: "text-info",
};
const BADGE: Record<string, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  brand: "bg-brand-soft text-brand",
  info: "bg-info-soft text-info",
};

/**
 * The Ask Abrams assistant: answers questions about deadlines, gaps, titles, groups and changes
 * from the app's own data. Rule-based — no AI service and no data leaves the system.
 */
export function AssistantRoom({ header, compact }: { header: React.ReactNode; compact?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>(load);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const ask = async (question: string) => {
    const q = question.trim();
    if (busy) return;
    setBusy(true);
    const mine: Turn[] = q ? [{ id: Date.now(), from: "me", text: q }] : [];
    setTurns((prev) => {
      const next = [...prev, ...mine];
      save(next);
      return next;
    });
    setText("");
    try {
      const reply = await api<AssistantReply>("/api/assistant", { method: "POST", json: { text: q } });
      setTurns((prev) => {
        const next: Turn[] = [...prev, { id: Date.now() + 1, from: "bot", reply }];
        save(next);
        return next;
      });
    } catch {
      setTurns((prev) => [...prev, { id: Date.now() + 1, from: "bot", reply: { text: "Sorry — I couldn't answer that just now. Please try again.", suggestions: [] } }]);
    } finally {
      setBusy(false);
    }
  };

  // Greet on the first open of the session.
  useEffect(() => {
    if (started.current || turns.length) return;
    started.current = true;
    void ask("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on first open
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy]);

  const lastBot = [...turns].reverse().find((t): t is Extract<Turn, { from: "bot" }> => t.from === "bot");

  return (
    <>
      {header}
      <div ref={scroller} className={cn("scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto bg-canvas", compact ? "p-3" : "p-5")}>
        {turns.map((t) =>
          t.from === "me" ? (
            <div key={t.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3 py-2 text-[13px] text-surface">{t.text}</p>
            </div>
          ) : (
            <div key={t.id} className="flex gap-2">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                <Bot className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-line bg-surface p-3 text-[13px] text-ink-2 shadow-sm">
                <p className="leading-relaxed">{t.reply.text}</p>
                {t.reply.stats?.length ? (
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {t.reply.stats.map((s) => (
                      <div key={s.label} className="rounded-lg bg-surface-2 px-2 py-1.5">
                        <div className="text-[10.5px] text-muted">{s.label}</div>
                        <div className={cn("num text-[14px] font-semibold text-ink", s.tone && TONE[s.tone])}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {t.reply.items?.length ? (
                  <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                    {t.reply.items.map((i, n) => (
                      <li key={`${i.isbn}-${n}`}>
                        <Link href={`/titles/${i.isbn}`} className="group flex items-center gap-2 px-2.5 py-1.5 hover:bg-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px] font-medium text-ink group-hover:text-info">{i.title}</span>
                            <span className="block truncate text-[11px] text-muted">{i.sub}</span>
                          </span>
                          {i.badge ? <span className={cn("num shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-medium", BADGE[i.tone ?? "info"])}>{i.badge}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {t.reply.link ? (
                  <Link href={t.reply.link.href} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-info hover:underline">
                    {t.reply.link.label}
                    <ArrowRight className="size-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          ),
        )}
        {busy ? (
          <div className="flex items-center gap-2 pl-8 text-xs text-muted">
            <Spinner className="size-3.5" /> Looking that up…
          </div>
        ) : null}
      </div>
      {lastBot?.reply.suggestions.length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-line bg-surface px-3 pt-2">
          {lastBot.reply.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void ask(s)}
              disabled={busy}
              className="rounded-full border border-line-strong px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-info/50 hover:bg-info-soft hover:text-info"
            >
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex items-center gap-2 bg-surface px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void ask(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask about deadlines, gaps, a title or ISBN…"
          maxLength={500}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 text-[13px] outline-none placeholder:text-subtle focus:border-info/60 focus:ring-2 focus:ring-info/15"
        />
        <button type="submit" disabled={!text.trim() || busy} className="flex size-9 items-center justify-center rounded-lg bg-brand text-white disabled:opacity-40" aria-label="Ask">
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </>
  );
}
