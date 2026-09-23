"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NotificationRow } from "@/features/desk/desk-view";
import { api } from "@/lib/api";
import { queryKeys, useNotifications, useUnreadCount, type NotificationView } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Skeleton } from "../ui/misc";
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from "../ui/overlay";

/** Sidebar bell: unread @mentions and replies; opening one jumps to its conversation. */
export function NotificationsBell({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const unread = useUnreadCount();
  const list = useNotifications(open);
  const read = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api("/api/notifications/read", { method: "POST", json: body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
      void qc.invalidateQueries({ queryKey: queryKeys.unread });
    },
  });
  const count = unread.data?.unread ?? 0;

  const go = (n: NotificationView) => {
    setOpen(false);
    if (!n.readAt) read.mutate({ ids: [n._id] });
    router.push(n.type === "chat_mention" ? `/chat?room=${encodeURIComponent(n.roomId ?? "everyone")}` : `/titles/${n.isbn}?thread=${encodeURIComponent(n.threadKey)}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content={collapsed ? `Notifications${count ? ` (${count} unread)` : ""}` : null} side="right">
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <Bell className="size-4 shrink-0" />
            {collapsed ? null : <span className="flex-1 text-left">Notifications</span>}
            {count ? (
              <span
                className={cn(
                  "num rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-[18px] text-white",
                  collapsed && "absolute -right-0.5 -top-0.5 px-1 leading-4",
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent side="right" align="start" className="w-[380px] p-0">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-[13px] font-semibold">Notifications</span>
          {count ? (
            <button type="button" onClick={() => read.mutate({ all: true })} className="flex items-center gap-1 text-xs text-muted hover:text-ink">
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          ) : null}
        </div>
        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto">
          {list.isPending ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : list.data?.items.length ? (
            <ul className="divide-y divide-line/70">
              {list.data.items.map((n) => (
                <NotificationRow key={n._id} n={n} compact onOpen={() => go(n)} />
              ))}
            </ul>
          ) : (
            <p className="px-4 py-10 text-center text-[13px] text-muted">You&apos;re all caught up. Mentions and replies will appear here.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
