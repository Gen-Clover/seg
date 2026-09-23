"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AtSign, MessageSquare, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import type { AccountRef } from "@seg/domain";
import { MentionComposer, MentionText } from "@/components/mention-composer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/overlay";
import { api } from "@/lib/api";
import { initials, personColor } from "@/lib/people";
import { queryKeys, useComments, useUsers, type CommentView, type Person } from "@/lib/queries";
import { fmtDate, timeAgo } from "@/lib/utils";

/** A conversation: the whole title, or one channel / organization / account row. */
export interface ThreadTarget {
  threadKey: string;
  level: "title" | "channel" | "org" | "account";
  ref: AccountRef | null;
  label: string;
}

export const titleThread = (isbn: string): ThreadTarget => ({ threadKey: `${isbn}|title`, level: "title", ref: null, label: "Whole title" });

const LEVEL_WORD = { title: "Title", channel: "Channel", org: "Organization", account: "Account" } as const;

// Separators used by estimateId() / accountKey() in the domain package.
const LEVEL_SEP = "\u001f";
const ID_NAME_SEP = "\u001e";

function labelFor(level: ThreadTarget["level"], ref: AccountRef): string {
  if (level === "channel") return ref.channelName ?? ref.channelId ?? "Channel";
  if (level === "org") return `${ref.orgName ?? ref.orgId} · ${ref.channelName ?? ref.channelId}`;
  return `${ref.accountName ?? ref.accountId} · ${ref.orgName ?? ref.orgId}`;
}

/** Rebuilds a conversation target from its thread key (an estimate id, or "<isbn>|title"). */
export function threadTarget(isbn: string, threadKey: string): ThreadTarget {
  if (threadKey === `${isbn}|title`) return titleThread(isbn);
  const [, level, ...parts] = threadKey.split(LEVEL_SEP) as [string, ThreadTarget["level"], ...string[]];
  const pair = (p: string | undefined): [string | null, string | null] => {
    if (p === undefined) return [null, null];
    const [id, name] = p.split(ID_NAME_SEP);
    return [id || null, name || null];
  };
  const [channelId, channelName] = pair(parts[0]);
  const [orgId, orgName] = pair(parts[1]);
  const [accountId, accountName] = pair(parts[2]);
  const ref: AccountRef = { channelId, channelName, orgId, orgName, accountId, accountName };
  return { threadKey, level, ref, label: labelFor(level, ref) };
}

/** Grid row key for a row thread, and the keys of its parent rows (to expand). */
export function rowKeysOfThread(threadKey: string): { row: string; parents: string[] } {
  const parts = threadKey.split(LEVEL_SEP).slice(2);
  return { row: parts.join(LEVEL_SEP), parents: parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join(LEVEL_SEP)) };
}

function targetOf(c: CommentView): ThreadTarget {
  const ref: AccountRef = { channelId: c.channelId, channelName: c.channelName, orgId: c.orgId, orgName: c.orgName, accountId: c.accountId, accountName: c.accountName };
  if (c.level === "title") return { threadKey: c.threadKey, level: "title", ref: null, label: "Whole title" };
  return { threadKey: c.threadKey, level: c.level, ref, label: labelFor(c.level, ref) };
}

/** Comments tab of the title side panel. */
export function CommentsTab({
  isbn,
  thread,
  onThread,
  onShowRow,
  me,
}: {
  isbn: string;
  thread: ThreadTarget | null;
  onThread: (t: ThreadTarget | null) => void;
  onShowRow: (t: ThreadTarget) => void;
  me: { email: string; role: string };
}) {
  const comments = useComments(isbn);
  const users = useUsers();

  const threads = useMemo(() => {
    const by = new Map<string, { target: ThreadTarget; items: CommentView[] }>();
    for (const c of comments.data?.comments ?? []) {
      const t = by.get(c.threadKey);
      if (t) t.items.push(c);
      else by.set(c.threadKey, { target: targetOf(c), items: [c] });
    }
    return by;
  }, [comments.data]);

  if (comments.isPending) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }

  if (thread) {
    return (
      <ThreadView
        isbn={isbn}
        target={threads.get(thread.threadKey)?.target ?? thread}
        items={threads.get(thread.threadKey)?.items ?? []}
        onBack={() => onThread(null)}
        onShowRow={onShowRow}
        me={me}
        people={users.data?.users ?? []}
      />
    );
  }

  const title = titleThread(isbn);
  const rows = [...threads.values()]
    .filter((t) => t.target.level !== "title")
    .sort((a, b) => b.items[b.items.length - 1]!.createdAt.localeCompare(a.items[a.items.length - 1]!.createdAt));
  const titleItems = threads.get(title.threadKey)?.items ?? [];

  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
      <ThreadCard target={title} items={titleItems} onOpen={() => onThread(title)} />
      {rows.length ? (
        <h3 className="border-y border-line bg-surface-2/70 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Rows</h3>
      ) : null}
      {rows.map((t) => (
        <ThreadCard key={t.target.threadKey} target={t.target} items={t.items} onOpen={() => onThread(t.target)} />
      ))}
      <p className="px-5 py-6 text-center text-xs text-muted">
        To discuss a specific channel, organization or account, use the <MessageSquare className="inline size-3.5" /> icon on its row in the grid.
      </p>
    </div>
  );
}

function ThreadCard({ target, items, onOpen }: { target: ThreadTarget; items: CommentView[]; onOpen: () => void }) {
  const last = items[items.length - 1];
  return (
    <button type="button" onClick={onOpen} className="block w-full border-b border-line/70 px-5 py-3 text-left hover:bg-surface-2/60">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-subtle">{LEVEL_WORD[target.level]}</span>
        <span className="truncate text-[13px] font-medium text-ink">{target.label}</span>
        <span className="num ml-auto shrink-0 text-xs text-muted">{items.length ? `${items.length} comment${items.length === 1 ? "" : "s"}` : ""}</span>
      </div>
      {last ? (
        <p className="mt-1 line-clamp-2 text-[13px] text-ink-2">
          <span className="font-medium">{last.authorName.split(" ")[0]}:</span> {last.body}
          <span className="ml-1 text-xs text-subtle">· {timeAgo(last.createdAt)}</span>
        </p>
      ) : (
        <p className="mt-1 text-[13px] text-muted">No comments yet — start the conversation.</p>
      )}
    </button>
  );
}

function ThreadView({
  isbn,
  target,
  items,
  onBack,
  onShowRow,
  me,
  people,
}: {
  isbn: string;
  target: ThreadTarget;
  items: CommentView[];
  onBack: () => void;
  onShowRow: (t: ThreadTarget) => void;
  me: { email: string; role: string };
  people: Person[];
}) {
  const qc = useQueryClient();
  const names = useMemo(() => new Map(people.map((p) => [p.email, p.name])), [people]);
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.comments(isbn) }),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete the comment."),
  });

  return (
    <>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          All conversations
        </Button>
        <div className="min-w-0 flex-1 text-right">
          <div className="text-[11px] text-subtle">{LEVEL_WORD[target.level]}</div>
          {target.level === "title" ? (
            <div className="truncate text-[13px] font-medium">{target.label}</div>
          ) : (
            <button type="button" onClick={() => onShowRow(target)} className="max-w-full truncate text-[13px] font-medium text-info hover:underline">
              {target.label}
            </button>
          )}
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-3">
        {items.length ? (
          <ol className="space-y-4">
            {items.map((c) => (
              <li key={c._id} className="group flex gap-2.5">
                <span
                  className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: personColor(c.authorEmail) }}
                >
                  {initials(c.authorName, c.authorEmail)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-medium text-ink">{c.authorName}</span>
                    <Tooltip content={`${fmtDate(c.createdAt.slice(0, 10))} ${new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}>
                      <span className="text-xs text-subtle">{timeAgo(c.createdAt)}</span>
                    </Tooltip>
                    {c.authorEmail === me.email || me.role === "admin" ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Delete this comment?")) remove.mutate(c._id);
                        }}
                        className="ml-auto rounded p-0.5 text-subtle opacity-0 hover:text-brand group-hover:opacity-100"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink-2">
                    <MentionText body={c.body} mentionNames={c.mentions.map((e) => names.get(e)).filter((n): n is string => !!n)} />
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="py-10 text-center text-[13px] text-muted">
            No comments on {target.level === "title" ? "this title" : "this row"} yet. Type <AtSign className="inline size-3.5" /> to mention someone.
          </p>
        )}
      </div>
      <Composer isbn={isbn} target={target} people={people.filter((p) => p.email !== me.email)} />
    </>
  );
}

function Composer({ isbn, target, people }: { isbn: string; target: ThreadTarget; people: Person[] }) {
  const qc = useQueryClient();
  return (
    <div className="border-t border-line p-3">
      <MentionComposer
        people={people}
        placeholder={`Comment on ${target.level === "title" ? "this title" : "this row"} — type @ to mention someone`}
        sendLabel="Comment"
        onSend={async (body, mentions) => {
          await api(`/api/titles/${encodeURIComponent(isbn)}/comments`, {
            method: "POST",
            json: { level: target.level, ref: target.ref, body, mentions },
          });
          await qc.invalidateQueries({ queryKey: queryKeys.comments(isbn) });
        }}
      />
    </div>
  );
}
