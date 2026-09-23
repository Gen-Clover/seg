"use client";

import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, Bot, ChevronDown, ChevronUp, Maximize2, Share2, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { useMe, useUsers } from "@/lib/queries";
import { useHydrated } from "@/lib/use-hydrated";
import { useLocalPref } from "@/lib/use-local-pref";
import { cn } from "@/lib/utils";
import { ConversationList, Room, useRooms } from "../chat/chat-view";
import { AssistantRoom } from "./assistant";

const ASSISTANT = "assistant";
const SHARE_EVENT = "ask-abrams:share";

interface DockState {
  open: boolean;
  /** Panel collapsed to its header bar. */
  collapsed: boolean;
  windows: { id: string; min: boolean }[];
}
const EMPTY: DockState = { open: false, collapsed: false, windows: [] };

/** Opens Ask Abrams with a title ready to share into a conversation (used by the title page). */
export function shareInAskAbrams(isbn: string, title: string) {
  window.dispatchEvent(new CustomEvent(SHARE_EVENT, { detail: { isbn, title } }));
}

/**
 * Ask Abrams, available on every page (bottom-right, like LinkedIn messaging): a round robot
 * launcher with the unread count; the panel lists the assistant and all conversations, and
 * conversations open as windows beside it without leaving the current page.
 */
export function AskAbramsDock() {
  // Rendered after hydration: it restores saved windows and session history from the browser.
  const hydrated = useHydrated();
  const pathname = usePathname();
  if (!hydrated || pathname === "/chat") return null;
  return <Dock />;
}

function Dock() {
  const me = useMe().data?.user;
  const users = useUsers();
  const [raw, setRaw] = useLocalPref("seg-ask-abrams", JSON.stringify(EMPTY));
  const state = useMemo<DockState>(() => {
    try {
      return { ...EMPTY, ...(JSON.parse(raw) as DockState) };
    } catch {
      return EMPTY;
    }
  }, [raw]);
  const set = (next: Partial<DockState>) => setRaw(JSON.stringify({ ...state, ...next }));
  const [share, setShare] = useState<{ isbn: string; title: string } | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [alerts, setAlerts] = useLocalPref("seg-ask-abrams-alerts", "off");
  const unread = useQuery({
    queryKey: ["chat", "unread"],
    queryFn: () => api<{ unread: number }>("/api/chat/unread"),
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });
  const rooms = useRooms();
  const count = unread.data?.unread ?? 0;

  const openWindow = (id: string) => {
    // Up to two windows (one on narrow screens); the oldest closes first.
    const max = typeof window !== "undefined" && window.innerWidth < 1180 ? 1 : 2;
    const others = state.windows.filter((w) => w.id !== id);
    set({ open: true, collapsed: false, windows: [{ id, min: false }, ...others].slice(0, max) });
    if (share && id !== ASSISTANT) {
      setDrafts((d) => ({ ...d, [id]: `Have a look at ${share.title} (${share.isbn}) ` }));
      setShare(null);
    }
  };
  const closeWindow = (id: string) => set({ windows: state.windows.filter((w) => w.id !== id) });
  const toggleMin = (id: string) => set({ windows: state.windows.map((w) => (w.id === id ? { ...w, min: !w.min } : w)) });

  // "Share in Ask Abrams" from a title page.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    const onShare = (e: Event) => {
      const detail = (e as CustomEvent<{ isbn: string; title: string }>).detail;
      setShare(detail);
      setRaw(JSON.stringify({ ...stateRef.current, open: true, collapsed: false }));
    };
    window.addEventListener(SHARE_EVENT, onShare);
    return () => window.removeEventListener(SHARE_EVENT, onShare);
  }, [setRaw]);

  // Alt+A opens or closes Ask Abrams.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const s = stateRef.current;
        setRaw(JSON.stringify({ ...s, open: !s.open || s.collapsed, collapsed: false }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRaw]);

  // Optional desktop alerts (the browser's own notifications — no outside service).
  const previous = useRef<number | null>(null);
  useEffect(() => {
    if (unread.data === undefined) return;
    const was = previous.current;
    previous.current = count;
    if (was === null || count <= was || alerts !== "on") return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible") return;
    new Notification("Ask Abrams", { body: `You have ${count} unread message${count === 1 ? "" : "s"}.`, icon: "/brand/abrams-a.png", tag: "ask-abrams" });
  }, [count, alerts, unread.data]);

  const toggleAlerts = async () => {
    if (alerts === "on") return setAlerts("off");
    if (typeof Notification === "undefined") return void toast.error("This browser doesn't support desktop alerts.");
    const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (permission !== "granted") return void toast.error("Desktop alerts are blocked for this site in your browser settings.");
    setAlerts("on");
    toast.success("Desktop alerts on — you'll get a notice for new messages while SEG is in the background.");
  };

  const people = users.data?.users ?? [];
  const meView = me ? { email: me.email, role: me.role } : null;

  const windowFrame = (id: string, min: boolean, title: string, body: React.ReactNode) => (
    <div
      key={id}
      className={cn(
        "pointer-events-auto flex w-[340px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-line-strong bg-surface shadow-[var(--shadow-pop)]",
        min ? "h-11" : "h-[min(480px,calc(100vh-88px))]",
      )}
    >
      {min ? (
        <button type="button" onClick={() => toggleMin(id)} className="flex h-11 items-center gap-2 px-3 text-left text-[13px] font-semibold hover:bg-surface-2">
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <ChevronUp className="size-4 text-muted" />
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              closeWindow(id);
            }}
            className="rounded p-0.5 text-muted hover:bg-surface-3"
            aria-label="Close"
          >
            <X className="size-4" />
          </span>
        </button>
      ) : (
        body
      )}
    </div>
  );

  const windowActions = (id: string) => (
    <div className="flex items-center">
      {id !== ASSISTANT ? (
        <Tooltip content="Open full page">
          <Link href={`/chat?room=${encodeURIComponent(id)}`} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Open full page">
            <Maximize2 className="size-3.5" />
          </Link>
        </Tooltip>
      ) : null}
      <Tooltip content="Minimise">
        <button type="button" onClick={() => toggleMin(id)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Minimise">
          <ChevronDown className="size-4" />
        </button>
      </Tooltip>
      <Tooltip content="Close">
        <button type="button" onClick={() => closeWindow(id)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close">
          <X className="size-4" />
        </button>
      </Tooltip>
    </div>
  );

  return (
    <div className="pointer-events-none fixed bottom-0 right-4 z-40 flex flex-row-reverse items-end gap-3">
      {/* Launcher, or the panel */}
      {!state.open ? (
        <Tooltip content="Ask Abrams (Alt A)" side="left">
          <button
            type="button"
            onClick={() => set({ open: true, collapsed: false })}
            className="pointer-events-auto relative mb-4 flex size-14 items-center justify-center rounded-full bg-brand text-white shadow-[0_8px_24px_-6px_rgba(233,26,35,0.55)] transition-transform hover:scale-105 focus-visible:ring-4 focus-visible:ring-brand/30"
            aria-label={`Ask Abrams${count ? `, ${count} unread` : ""}`}
          >
            <Bot className="size-7" />
            {count ? (
              <span className="num absolute -right-1 -top-1 min-w-[22px] rounded-full border-2 border-surface bg-ink px-1 text-center text-[11px] font-bold leading-[18px] text-surface">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        </Tooltip>
      ) : (
        <div
          className={cn(
            "pointer-events-auto flex w-[340px] flex-col overflow-hidden rounded-t-xl border border-b-0 border-line-strong bg-surface shadow-[var(--shadow-pop)]",
            state.collapsed ? "h-12" : "h-[min(600px,calc(100vh-72px))]",
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
            <button type="button" onClick={() => set({ collapsed: !state.collapsed })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                <Bot className="size-4" />
              </span>
              <span className="truncate text-[14px] font-semibold">Ask Abrams</span>
              {count ? <span className="num rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white">{count}</span> : null}
            </button>
            <Tooltip content={alerts === "on" ? "Desktop alerts on" : "Turn on desktop alerts"}>
              <button type="button" onClick={() => void toggleAlerts()} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Desktop alerts">
                {alerts === "on" ? <Bell className="size-4 text-info" /> : <BellOff className="size-4" />}
              </button>
            </Tooltip>
            <Tooltip content="Open full page">
              <Link href="/chat" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Open Ask Abrams full page">
                <Maximize2 className="size-4" />
              </Link>
            </Tooltip>
            <Tooltip content={state.collapsed ? "Expand" : "Minimise"}>
              <button type="button" onClick={() => set({ collapsed: !state.collapsed })} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Minimise">
                {state.collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
            </Tooltip>
            <Tooltip content="Close (Alt A)">
              <button type="button" onClick={() => set({ open: false })} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Close Ask Abrams">
                <X className="size-4" />
              </button>
            </Tooltip>
          </div>
          {state.collapsed ? null : (
            <>
              {share ? (
                <div className="flex items-start gap-2 border-b border-info/30 bg-info-soft px-3 py-2 text-xs text-ink-2">
                  <Share2 className="mt-0.5 size-3.5 shrink-0 text-info" />
                  <span className="min-w-0 flex-1">
                    Share <span className="font-semibold">{share.title}</span> — pick a conversation below.
                  </span>
                  <button type="button" onClick={() => setShare(null)} className="text-muted hover:text-ink" aria-label="Cancel sharing">
                    <X className="size-3.5" />
                  </button>
                </div>
              ) : null}
              <ConversationList
                compact
                activeId={state.windows[0]?.id ?? null}
                onOpen={openWindow}
                top={
                  share ? null : (
                    <button
                      type="button"
                      onClick={() => openWindow(ASSISTANT)}
                      className="mx-2 mb-1 flex w-[calc(100%-16px)] gap-2.5 rounded-lg border border-brand/20 bg-brand-soft/60 px-2 py-2 text-left hover:bg-brand-soft"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                        <Bot className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink">Abrams Assistant</span>
                        <span className="block truncate text-xs text-muted">Ask about deadlines, gaps, a title or an ISBN</span>
                      </span>
                    </button>
                  )
                }
              />
            </>
          )}
        </div>
      )}

      {/* Conversation windows beside the panel (newest nearest) */}
      {state.windows.map((w) => {
        if (w.id === ASSISTANT) {
          return windowFrame(
            w.id,
            w.min,
            "Abrams Assistant",
            <AssistantRoom
              compact
              header={
                <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
                  <span className="flex size-7 items-center justify-center rounded-full bg-brand text-white">
                    <Bot className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">Abrams Assistant</span>
                    <span className="block truncate text-[11px] text-muted">Answers from SEG data · no AI service</span>
                  </span>
                  {windowActions(w.id)}
                </div>
              }
            />,
          );
        }
        const room = rooms.data?.rooms.find((r) => r._id === w.id);
        if (!room) return null;
        return windowFrame(
          w.id,
          w.min,
          room.title,
          <Room key={room._id} room={room} me={meView} people={people} compact actions={windowActions(w.id)} initialText={drafts[w.id]} />,
        );
      })}
    </div>
  );
}
