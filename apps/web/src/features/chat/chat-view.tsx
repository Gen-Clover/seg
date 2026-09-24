"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Bot, Flag, Hash, MessageSquare, MoreHorizontal, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { MentionComposer, MentionText } from "@/components/mention-composer";
import { Button } from "@/components/ui/button";
import { Badge, Input, Skeleton, Spinner, Textarea } from "@/components/ui/misc";
import { Dialog, DialogContent, Popover, PopoverContent, PopoverTrigger, Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { clockTime, initials, personColor } from "@/lib/people";
import { queryKeys, useMe, useUsers, type Person } from "@/lib/queries";
import { cn, fmtDate, timeAgo } from "@/lib/utils";
import type { MessageView, RoomView, TitleThreadView } from "@/server/services/chat";

const EVERYONE = "everyone";
const POLL_MS = 3_000;
export const chatKeys = {
  rooms: ["chat", "rooms"] as const,
  unread: ["chat", "unread"] as const,
  threads: ["chat", "threads"] as const,
};

/** Ask Abrams full page: conversations on the left, the open conversation on the right. */
export function ChatView() {
  const params = useSearchParams();
  const router = useRouter();
  const roomId = params.get("room") ?? EVERYONE;
  const me = useMe().data?.user;
  const users = useUsers();
  const rooms = useRooms();
  const open = (id: string) => router.replace(`/chat?room=${encodeURIComponent(id)}`, { scroll: false });
  const current = rooms.data?.rooms.find((r) => r._id === roomId);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex items-center gap-2 px-4 pb-1 pt-4">
          <AskAbramsMark />
          <h1 className="text-lg font-semibold">Ask Abrams</h1>
        </div>
        <ConversationList activeId={roomId} onOpen={open} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-canvas">
        {current ? (
          <Room key={current._id} room={current} me={me ? { email: me.email, role: me.role } : null} people={users.data?.users ?? []} />
        ) : rooms.isPending ? (
          <div className="p-6">
            <Skeleton className="h-10 w-64" />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="size-8 text-subtle" />
            <p className="text-[13px] text-muted">That conversation isn&apos;t available. Pick one on the left.</p>
          </div>
        )}
      </section>
    </div>
  );
}

/** Round Ask Abrams mark: a friendly robot on Abrams red. */
export function AskAbramsMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-sm", className)}>
      <Bot className="size-4" />
    </span>
  );
}

export function useRooms() {
  return useQuery({
    queryKey: chatKeys.rooms,
    queryFn: () => api<{ rooms: RoomView[] }>("/api/chat/rooms"),
    refetchInterval: 8_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Searchable conversation list (Everyone, groups, direct messages, title conversations), with
 * buttons to start a direct message or a group. `top` renders pinned items above (the assistant).
 */
export function ConversationList({
  activeId,
  onOpen,
  top,
  compact,
}: {
  activeId: string | null;
  onOpen: (roomId: string) => void;
  top?: React.ReactNode;
  compact?: boolean;
}) {
  const me = useMe().data?.user;
  const users = useUsers();
  const rooms = useRooms();
  const threads = useQuery({ queryKey: chatKeys.threads, queryFn: () => api<{ threads: TitleThreadView[] }>("/api/chat/threads"), staleTime: 30_000 });
  const [q, setQ] = useState("");
  const all = rooms.data?.rooms ?? [];
  const match = (text: string) => text.toLowerCase().includes(q.trim().toLowerCase());
  const list = all.filter((r) => !q.trim() || match(r.title));
  const groups = list.filter((r) => r.type === "group");
  const direct = list.filter((r) => r.type === "direct");
  const everyone = list.find((r) => r.type === "everyone");
  const people = (users.data?.users ?? []).filter((p) => p.email !== me?.email);

  return (
    <>
      <div className={cn("flex items-center gap-1 pb-2", compact ? "px-3 pt-2" : "px-3")}>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a conversation" className="pl-8" />
        </div>
        <NewDirect people={people} onOpened={onOpen} />
        <NewGroup people={people} onCreated={onOpen} />
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-3">
        {top}
        {rooms.isPending ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <>
            {everyone ? <RoomItem room={everyone} me={me?.email} active={activeId === everyone._id} onClick={() => onOpen(everyone._id)} /> : null}
            <Section title="Groups" empty="Create a group with the + button.">
              {groups.map((r) => (
                <RoomItem key={r._id} room={r} me={me?.email} active={activeId === r._id} onClick={() => onOpen(r._id)} />
              ))}
            </Section>
            <Section title="Direct messages" empty="Start one with the message button.">
              {direct.map((r) => (
                <RoomItem key={r._id} room={r} me={me?.email} active={activeId === r._id} onClick={() => onOpen(r._id)} />
              ))}
            </Section>
            <Section title="Title conversations" empty="Comments you write or are mentioned in on titles appear here.">
              {(threads.data?.threads ?? [])
                .filter((t) => !q.trim() || match(`${t.titleName} ${t.rowLabel}`))
                .map((t) => (
                  <Link
                    key={t.threadKey}
                    href={`/titles/${t.isbn}?thread=${encodeURIComponent(t.threadKey)}`}
                    className="mx-2 flex gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-2"
                  >
                    <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-soft text-info">
                      <BookOpen className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">{t.titleName}</span>
                        <span className="ml-auto shrink-0 text-[11px] text-subtle">{timeAgo(t.lastAt)}</span>
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {t.rowLabel} · {t.lastAuthor.split(" ")[0]}: {t.excerpt}
                      </span>
                    </span>
                  </Link>
                ))}
            </Section>
          </>
        )}
      </div>
    </>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="mt-3">
      <h2 className="px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {children.length ? children : <p className="px-4 py-1 text-xs text-subtle">{empty}</p>}
    </div>
  );
}

function RoomIcon({ room, me, size = "size-8" }: { room: RoomView; me?: string; size?: string }) {
  if (room.type === "everyone")
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-brand text-white", size)}>
        <Hash className="size-4" />
      </span>
    );
  if (room.type === "group")
    return (
      <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-surface-3 text-ink-2", size)}>
        <Users className="size-4" />
      </span>
    );
  // Direct: coloured like the other person everywhere else in the app.
  const other = room.members.find((m) => m !== me) ?? room.members[0] ?? room.title;
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white", size)} style={{ background: personColor(other) }}>
      {initials(room.title)}
    </span>
  );
}

function RoomItem({ room, me, active, onClick }: { room: RoomView; me?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("mx-2 flex w-[calc(100%-16px)] gap-2.5 rounded-lg px-2 py-2 text-left transition-colors", active ? "bg-info-soft" : "hover:bg-surface-2")}
    >
      <RoomIcon room={room} me={me} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate text-[13px] text-ink", room.unread ? "font-semibold" : "font-medium")}>{room.title}</span>
          {room.lastMessageAt ? <span className="ml-auto shrink-0 text-[11px] text-subtle">{timeAgo(room.lastMessageAt)}</span> : null}
        </span>
        <span className="flex items-center gap-2">
          <span className={cn("block min-w-0 flex-1 truncate text-xs", room.unread ? "text-ink-2" : "text-muted")}>
            {room.lastMessage ? `${room.lastMessage.authorName.split(" ")[0]}: ${room.lastMessage.excerpt}` : "No messages yet"}
          </span>
          {room.unread ? <span className="num rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white">{room.unread}</span> : null}
        </span>
      </span>
    </button>
  );
}

/* ---------------- One conversation ---------------- */

const stamp = (m: MessageView) => [m.createdAt, m.editedAt, m.deletedAt].filter((t): t is string => !!t).sort().at(-1)!;

function mergeMessages(prev: MessageView[], incoming: MessageView[]): MessageView[] {
  const byId = new Map(prev.map((m) => [m._id, m]));
  for (const m of incoming) byId.set(m._id, m);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** One conversation. `compact` is the docked-window version; `actions` go in its header. */
export function Room({
  room,
  me,
  people,
  compact,
  actions,
  initialText,
}: {
  room: RoomView;
  me: { email: string; role: string } | null;
  people: Person[];
  compact?: boolean;
  actions?: React.ReactNode;
  initialText?: string;
}) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<MessageView[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const cursor = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const url = `/api/chat/rooms/${encodeURIComponent(room._id)}`;
  const names = useMemo(() => new Map(people.map((p) => [p.email, p.name])), [people]);
  const members = room.type === "everyone" ? people.map((p) => p.email) : room.members;

  const markRead = () => {
    void api(`${url}/read`, { method: "POST" })
      .then(() => {
        void qc.invalidateQueries({ queryKey: chatKeys.rooms });
        void qc.invalidateQueries({ queryKey: chatKeys.unread });
        void qc.invalidateQueries({ queryKey: queryKeys.unread });
      })
      .catch(() => undefined);
  };

  // Load the latest page, then poll for new, edited and deleted messages while visible.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = (incoming: MessageView[], replace: boolean) => {
      for (const m of incoming) if (!cursor.current || stamp(m) > cursor.current) cursor.current = stamp(m);
      setMessages((prev) => (replace || !prev ? mergeMessages([], incoming) : mergeMessages(prev, incoming)));
    };
    const poll = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible" && cursor.current) {
        try {
          const res = await api<{ messages: MessageView[] }>(`${url}/messages?after=${encodeURIComponent(cursor.current)}`);
          if (!stopped && res.messages.length) {
            apply(res.messages, false);
            if (res.messages.some((m) => m.authorEmail !== me?.email)) markRead();
          }
        } catch {
          // Try again on the next tick.
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void (async () => {
      try {
        const res = await api<{ messages: MessageView[]; hasMore: boolean }>(`${url}/messages`);
        if (stopped) return;
        cursor.current = res.messages.length ? res.messages.map(stamp).sort().at(-1)! : new Date(0).toISOString();
        apply(res.messages, true);
        setHasMore(res.hasMore);
        markRead();
      } catch (err) {
        if (!stopped) toast.error(err instanceof Error ? err.message : "Couldn't load messages.");
      }
      timer = setTimeout(poll, POLL_MS);
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one loop per room (component is keyed by room)
  }, [url]);

  // Keep the view pinned to the newest message unless the reader scrolled up.
  useEffect(() => {
    const el = scroller.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const loadOlder = async () => {
    if (!messages?.length || loadingOlder) return;
    setLoadingOlder(true);
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    try {
      const res = await api<{ messages: MessageView[]; hasMore: boolean }>(`${url}/messages?before=${encodeURIComponent(messages[0]!.createdAt)}`);
      stickToBottom.current = false;
      setMessages((prev) => mergeMessages(prev ?? [], res.messages));
      setHasMore(res.hasMore);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (body: string, mentions: string[]) => {
    const res = await api<{ message: MessageView }>(`${url}/messages`, { method: "POST", json: { body, mentions } });
    stickToBottom.current = true;
    if (!cursor.current || stamp(res.message) > cursor.current) cursor.current = stamp(res.message);
    setMessages((prev) => mergeMessages(prev ?? [], [res.message]));
    void qc.invalidateQueries({ queryKey: chatKeys.rooms });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api(`/api/chat/messages/${editing.id}`, { method: "PATCH", json: { body: editing.text } });
      const now = new Date().toISOString();
      setMessages((prev) => (prev ?? []).map((m) => (m._id === editing.id ? { ...m, body: editing.text.trim(), editedAt: now } : m)));
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the change.");
    }
  };

  const [reporting, setReporting] = useState<MessageView | null>(null);

  const remove = async (id: string) => {
    if (!window.confirm("Delete this message?")) return;
    try {
      await api(`/api/chat/messages/${id}`, { method: "DELETE" });
      const now = new Date().toISOString();
      setMessages((prev) => (prev ?? []).map((m) => (m._id === id ? { ...m, deletedAt: now } : m)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the message.");
    }
  };

  // Group by day; consecutive messages by one person within 5 minutes are shown together.
  const days = useMemo(() => {
    const out: { day: string; items: { m: MessageView; first: boolean }[] }[] = [];
    let prev: MessageView | null = null;
    for (const m of messages ?? []) {
      const d = new Date(m.createdAt);
      const day = fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
      if (out.at(-1)?.day !== day) {
        out.push({ day, items: [] });
        prev = null;
      }
      const first = !prev || prev.authorEmail !== m.authorEmail || Date.parse(m.createdAt) - Date.parse(prev.createdAt) > 5 * 60_000;
      out.at(-1)!.items.push({ m, first });
      prev = m;
    }
    return out;
  }, [messages]);

  return (
    <>
      <header className={cn("flex shrink-0 items-center gap-3 border-b border-line bg-surface", compact ? "h-12 px-3" : "h-14 px-5")}>
        <RoomIcon room={room} me={me?.email} size={compact ? "size-7" : "size-8"} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{room.title}</div>
          <div className="truncate text-xs text-muted">
            {room.type === "everyone" ? "The whole team" : room.type === "direct" ? "Direct message" : `${room.members.length} members`}
          </div>
        </div>
        <div className={cn("hidden -space-x-1.5", !compact && "md:flex")}>
          {members.slice(0, 6).map((e) => (
            <Tooltip key={e} content={names.get(e) ?? e}>
              <span className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-surface" style={{ background: personColor(e) }}>
                {initials(names.get(e), e)}
              </span>
            </Tooltip>
          ))}
          {members.length > 6 ? <span className="num ml-2 self-center text-xs text-muted">+{members.length - 6}</span> : null}
        </div>
        {room.type === "group" ? <GroupMenu room={room} people={people} /> : null}
        {actions}
      </header>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto", compact ? "px-2 py-2" : "px-5 py-4")}
      >
        {messages === null ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-2/3" />
            ))}
          </div>
        ) : !messages.length ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageSquare className="size-8 text-subtle" />
            <p className="text-[13px] font-medium text-ink">Start the conversation</p>
            <p className="max-w-sm text-xs text-muted">Type @ to mention someone. Paste an ISBN and it links to that title.</p>
          </div>
        ) : (
          <>
            {hasMore ? (
              <div className="pb-3 text-center">
                <Button size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
                  {loadingOlder ? <Spinner className="size-3.5" /> : null}
                  Load earlier messages
                </Button>
              </div>
            ) : null}
            {days.map((g) => (
              <section key={g.day}>
                <div className="my-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <span className="h-px flex-1 bg-line" />
                  {g.day}
                  <span className="h-px flex-1 bg-line" />
                </div>
                {g.items.map(({ m, first }) => {
                  const mine = m.authorEmail === me?.email;
                  const canDelete = mine || me?.role === "admin";
                  return (
                    <div key={m._id} className={cn("group relative flex gap-3 rounded-lg px-2 hover:bg-surface/70", first ? "mt-2 pt-1.5" : "pt-0.5")}>
                      <div className="w-8 shrink-0">
                        {first ? (
                          <span className="flex size-8 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: personColor(m.authorEmail) }}>
                            {initials(m.authorName, m.authorEmail)}
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 pb-1">
                        {first ? (
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-semibold text-ink">{m.authorName}</span>
                            <span className="text-[11px] text-subtle">{clockTime(m.createdAt)}</span>
                          </div>
                        ) : null}
                        {m.deletedAt ? (
                          <p className="text-[13px] italic text-subtle">Message deleted</p>
                        ) : editing?.id === m._id ? (
                          <div className="mt-1">
                            <textarea
                              value={editing.text}
                              autoFocus
                              onChange={(e) => setEditing({ id: m._id, text: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void saveEdit();
                                } else if (e.key === "Escape") setEditing(null);
                              }}
                              className="field-sizing-content w-full resize-none rounded-lg border border-info/50 bg-surface px-3 py-2 text-[13px] outline-none ring-2 ring-info/15"
                            />
                            <div className="mt-1 flex gap-2 text-xs">
                              <Button size="sm" variant="primary" onClick={() => void saveEdit()}>
                                Save
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink-2">
                            <MentionText body={m.body} mentionNames={m.mentions.map((e) => names.get(e)).filter((n): n is string => !!n)} />
                            {m.editedAt ? <span className="ml-1 text-[11px] text-subtle">(edited)</span> : null}
                          </p>
                        )}
                        {!m.deletedAt && m.titleRefs.length ? (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {m.titleRefs.map((t) => (
                              <Link
                                key={t.isbn}
                                href={`/titles/${t.isbn}`}
                                className="inline-flex max-w-xs items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-2 py-1 text-xs hover:border-info/50 hover:text-info"
                              >
                                <BookOpen className="size-3.5 shrink-0 text-info" />
                                <span className="truncate font-medium">{t.title}</span>
                                <span className="num text-muted">{t.isbn}</span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {!m.deletedAt && editing?.id !== m._id ? (
                        <div className="absolute -top-2 right-2 hidden gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-sm group-hover:flex">
                          {!mine ? (
                            <Tooltip content="Report to an admin">
                              <button type="button" onClick={() => setReporting(m)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-warn" aria-label="Report message">
                                <Flag className="size-3.5" />
                              </button>
                            </Tooltip>
                          ) : null}
                          {mine ? (
                            <Tooltip content="Edit">
                              <button type="button" onClick={() => setEditing({ id: m._id, text: m.body })} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Edit message">
                                <Pencil className="size-3.5" />
                              </button>
                            </Tooltip>
                          ) : null}
                          {canDelete ? (
                            <Tooltip content="Delete">
                              <button type="button" onClick={() => void remove(m._id)} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-brand" aria-label="Delete message">
                                <Trash2 className="size-3.5" />
                              </button>
                            </Tooltip>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </section>
            ))}
          </>
        )}
      </div>

      <ReportDialog message={reporting} onClose={() => setReporting(null)} />
      <div className={cn("shrink-0 border-t border-line bg-surface", compact ? "px-3 py-2" : "px-5 py-3")}>
        <MentionComposer
          key={initialText ?? ""}
          initialText={initialText}
          autoFocus={!!initialText}
          people={people.filter((p) => p.email !== me?.email && members.includes(p.email))}
          placeholder={`Message ${room.type === "direct" ? room.title : room.title === "Everyone" ? "everyone" : room.title}`}
          onSend={send}
          enterToSend
          rows={1}
        />
      </div>
    </>
  );
}

/* ---------------- Starting conversations ---------------- */

function PeoplePicker({ people, selected, onToggle }: { people: Person[]; selected: Set<string>; onToggle: (email: string) => void }) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="mb-2" />
      <ul className="scrollbar-thin max-h-64 overflow-y-auto rounded-lg border border-line">
        {shown.map((p) => (
          <li key={p.email}>
            <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-surface-2">
              <input type="checkbox" checked={selected.has(p.email)} onChange={() => onToggle(p.email)} className="size-4 accent-[var(--info)]" />
              <span className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: personColor(p.email) }}>
                {initials(p.name, p.email)}
              </span>
              <span className="font-medium">{p.name}</span>
              <Badge className="ml-auto capitalize">{p.role}</Badge>
            </label>
          </li>
        ))}
        {!shown.length ? <li className="px-3 py-4 text-center text-xs text-muted">No one matches.</li> : null}
      </ul>
    </div>
  );
}

function NewGroup({ people, onCreated }: { people: Person[]; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [members, setMembers] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (e: string) => setMembers((s) => (s.has(e) ? new Set([...s].filter((x) => x !== e)) : new Set([...s, e])));
  const create = async () => {
    setBusy(true);
    try {
      const res = await api<{ room: RoomView }>("/api/chat/rooms", { method: "POST", json: { name, members: [...members] } });
      await qc.invalidateQueries({ queryKey: chatKeys.rooms });
      setOpen(false);
      setName("");
      setMembers(new Set());
      onCreated(res.room._id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the group.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content="New group">
        <Button size="icon-sm" variant="ghost" onClick={() => setOpen(true)} aria-label="New group">
          <Plus />
        </Button>
      </Tooltip>
      <DialogContent title="New group" description="Name the group and pick who's in it. You can add more people later.">
        <div className="space-y-3 p-5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name, e.g. Fall 2026 – Children's" autoFocus />
          <PeoplePicker people={people} selected={members} onToggle={toggle} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={() => void create()} disabled={!name.trim() || !members.size || busy}>
              {busy ? <Spinner className="size-3.5" /> : <Users />}
              Create group
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDirect({ people, onOpened }: { people: Person[]; onOpened: (id: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const start = async (email: string) => {
    try {
      const res = await api<{ roomId: string }>("/api/chat/direct", { method: "POST", json: { email } });
      await qc.invalidateQueries({ queryKey: chatKeys.rooms });
      setOpen(false);
      onOpened(res.roomId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the conversation.");
    }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="New direct message">
        <PopoverTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="New direct message">
            <MessageSquare />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-72 p-1">
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Message someone</div>
        {people.map((p) => (
          <button key={p.email} type="button" onClick={() => void start(p.email)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2">
            <span className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: personColor(p.email) }}>
              {initials(p.name, p.email)}
            </span>
            <span className="font-medium">{p.name}</span>
            <span className="ml-auto text-xs capitalize text-muted">{p.role}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function GroupMenu({ room, people }: { room: RoomView; people: Person[] }) {
  const qc = useQueryClient();
  const router = useRouter();
  const [dialog, setDialog] = useState<"add" | "rename" | null>(null);
  const [name, setName] = useState(room.name);
  const [add, setAdd] = useState<Set<string>>(new Set());
  const url = `/api/chat/rooms/${encodeURIComponent(room._id)}`;
  const update = async (json: Record<string, unknown>) => {
    try {
      await api(url, { method: "PATCH", json });
      await qc.invalidateQueries({ queryKey: chatKeys.rooms });
      setDialog(null);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the group.");
      return false;
    }
  };
  const notMembers = people.filter((p) => !room.members.includes(p.email));
  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label="Group options">
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-48 p-1">
          <MenuButton icon={<UserPlus />} onClick={() => setDialog("add")}>
            Add people
          </MenuButton>
          <MenuButton icon={<Pencil />} onClick={() => setDialog("rename")}>
            Rename
          </MenuButton>
          <MenuButton
            icon={<Trash2 />}
            danger
            onClick={async () => {
              if (window.confirm(`Leave "${room.name}"?`) && (await update({ leave: true }))) router.replace("/chat");
            }}
          >
            Leave group
          </MenuButton>
        </PopoverContent>
      </Popover>
      <Dialog open={dialog === "add"} onOpenChange={(o) => setDialog(o ? "add" : null)}>
        <DialogContent title={`Add people to ${room.name}`}>
          <div className="space-y-3 p-5">
            {notMembers.length ? (
              <PeoplePicker people={notMembers} selected={add} onToggle={(e) => setAdd((s) => (s.has(e) ? new Set([...s].filter((x) => x !== e)) : new Set([...s, e])))} />
            ) : (
              <p className="text-[13px] text-muted">Everyone is already in this group.</p>
            )}
            <div className="flex justify-end">
              <Button variant="brand" disabled={!add.size} onClick={async () => (await update({ add: [...add] })) && setAdd(new Set())}>
                Add {add.size || ""}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "rename"} onOpenChange={(o) => setDialog(o ? "rename" : null)}>
        <DialogContent title="Rename group">
          <div className="space-y-3 p-5">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <div className="flex justify-end">
              <Button variant="brand" disabled={!name.trim()} onClick={() => void update({ name })}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MenuButton({ icon, children, onClick, danger }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 [&_svg]:size-4", danger ? "text-brand" : "text-ink-2")}
    >
      {icon}
      {children}
    </button>
  );
}

/** Flags a message for the admins (Admin console → Chat moderation). */
function ReportDialog({ message, onClose }: { message: MessageView | null; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (!message) return;
    setSending(true);
    try {
      await api(`/api/chat/messages/${message._id}/report`, { method: "POST", json: { reason } });
      toast.success("Thanks — the admins will review this message.");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the report.");
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog open={!!message} onOpenChange={(open) => (open ? null : onClose())}>
      {message ? (
        <DialogContent title="Report this message" description={`From ${message.authorName}. Only admins see reports.`}>
          <div className="space-y-3 px-5 py-4">
            <blockquote className="line-clamp-4 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[13px] text-ink-2">{message.body}</blockquote>
            <Textarea autoFocus rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What's wrong with it?" maxLength={500} />
          </div>
          <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="brand" disabled={reason.trim().length < 3 || sending} onClick={() => void submit()}>
              {sending ? <Spinner className="size-3.5" /> : <Flag />}
              Send report
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
