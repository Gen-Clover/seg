"use client";

import { Send } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { initials, personColor } from "@/lib/people";
import type { Person } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Spinner } from "./ui/misc";

/**
 * Message box with @mention suggestions (type "@" and pick a person), shared by title comments
 * and team chat. `enterToSend`: Enter sends and Shift+Enter adds a line (chat); otherwise
 * Ctrl/⌘+Enter sends (comments).
 */
export function MentionComposer({
  people,
  placeholder,
  onSend,
  enterToSend,
  sendLabel = "Send",
  rows = 3,
  autoFocus,
}: {
  people: Person[];
  placeholder: string;
  onSend: (body: string, mentions: string[]) => Promise<unknown>;
  enterToSend?: boolean;
  sendLabel?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [sending, setSending] = useState(false);
  // Where to put the caret after inserting a mention (applied before the next keystroke can land).
  const caret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caret.current === null || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [text]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return people.filter((p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)).slice(0, 6);
  }, [people, query]);

  const detect = (value: string, at: number) => {
    const m = /(^|\s)@([\w.\-]*)$/.exec(value.slice(0, at));
    setQuery(m ? m[2]! : null);
    setHighlight(0);
  };

  const choose = (p: Person) => {
    const at = input.current?.selectionStart ?? text.length;
    const before = text.slice(0, at).replace(/@([\w.\-]*)$/, `@${p.name} `);
    setText(before + text.slice(at));
    setPicked((m) => new Map(m).set(p.email, p.name));
    setQuery(null);
    caret.current = before.length;
  };

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    const mentions = [...picked].filter(([, name]) => body.includes(`@${name}`)).map(([email]) => email);
    setSending(true);
    try {
      await onSend(body, mentions);
      setText("");
      setPicked(new Map());
      setQuery(null);
      input.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="relative">
      {query !== null && matches.length ? (
        <ul className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          {matches.map((p, i) => (
            <li key={p.email}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px]", i === highlight && "bg-surface-2")}
              >
                <span className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: personColor(p.email) }}>
                  {initials(p.name, p.email)}
                </span>
                <span className="font-medium">{p.name}</span>
                <span className="truncate text-xs text-subtle">{p.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <textarea
        ref={input}
        value={text}
        rows={rows}
        autoFocus={autoFocus}
        maxLength={4000}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (query !== null && matches.length) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % matches.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + matches.length) % matches.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              choose(matches[highlight]!);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setQuery(null);
              return;
            }
          }
          const sendKey = enterToSend ? e.key === "Enter" && !e.shiftKey : e.key === "Enter" && (e.ctrlKey || e.metaKey);
          if (sendKey) {
            e.preventDefault();
            void send();
          }
        }}
        className="field-sizing-content max-h-48 min-h-[44px] w-full resize-none rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] outline-none placeholder:text-subtle focus:border-info/60 focus:ring-2 focus:ring-info/15"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-subtle">{enterToSend ? "Enter to send · Shift + Enter for a new line" : "Ctrl + Enter to send"} · @ to mention</span>
        <Button size="sm" variant="brand" onClick={() => void send()} disabled={!text.trim() || sending}>
          {sending ? <Spinner className="size-3.5" /> : <Send />}
          {sendLabel}
        </Button>
      </div>
    </div>
  );
}

/** Message text with @mentions of known people highlighted. */
export function MentionText({ body, mentionNames }: { body: string; mentionNames: string[] }) {
  if (!mentionNames.length) return <>{body}</>;
  const escaped = mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = body.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("@") && mentionNames.includes(p.slice(1)) ? (
          <span key={i} className="rounded bg-info-soft px-0.5 font-medium text-info">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
