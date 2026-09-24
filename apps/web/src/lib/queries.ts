"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import type { AccountRef, GroupDefinition } from "@seg/domain";
import type { Session } from "@/server/auth/session";
import type { CommentView, NotificationView } from "@/server/services/comments";
import type { ChangedTitle } from "@/server/services/desk";
import type { TitleDetail, TitleSearchHit, TitleSummaryRow } from "@/server/services/titles";
import type { ChannelInsights } from "@/server/services/insights";
import type { TrendsView } from "@/server/services/trends";
import { api } from "./api";
import { useHydrated } from "./use-hydrated";

export type { ChangedTitle, CommentView, NotificationView, TitleDetail, TitleSearchHit, TitleSummaryRow, TrendsView };

export const queryKeys = {
  me: ["me"] as const,
  summary: ["titles"] as const,
  title: (isbn: string) => ["title", isbn] as const,
  search: (q: string) => ["search", q] as const,
  accounts: (q: string) => ["accounts", q] as const,
  history: (isbn: string, estimateId?: string) => ["history", isbn, estimateId ?? ""] as const,
  comments: (isbn: string) => ["comments", isbn] as const,
  unread: ["notifications", "unread"] as const,
  notifications: ["notifications", "list"] as const,
  desk: ["desk"] as const,
  trends: ["trends"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<{ user: Session; mainMenuUrl: string | null }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
}

export function useSummary() {
  const query = useQuery({
    queryKey: queryKeys.summary,
    queryFn: () => api<{ titles: TitleSummaryRow[]; generatedAt: string }>("/api/titles"),
    staleTime: 60_000,
  });
  // The catalog is often already cached (sidebar, search) before a page finishes hydrating:
  // report "pending" until then so the first client render matches the server HTML.
  const hydrated = useHydrated();
  return hydrated ? query : ({ ...query, data: undefined, isPending: true, isSuccess: false, status: "pending" } as typeof query);
}

export const titleQuery = (isbn: string) => ({
  queryKey: queryKeys.title(isbn),
  queryFn: () => api<TitleDetail>(`/api/titles/${encodeURIComponent(isbn)}`),
  staleTime: 30_000,
});

export function useTitle(isbn: string) {
  return useQuery({ ...titleQuery(isbn), placeholderData: undefined });
}

/** Warms the cache for a title (used for next/previous navigation and row hover). */
export function usePrefetchTitle() {
  const qc = useQueryClient();
  return (isbn: string | undefined) => {
    if (isbn) void qc.prefetchQuery(titleQuery(isbn));
  };
}

export function useTitleSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.search(q),
    queryFn: () => api<{ results: TitleSearchHit[] }>(`/api/titles/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useAccountSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.accounts(q),
    queryFn: () => api<{ accounts: AccountRef[] }>(`/api/accounts?q=${encodeURIComponent(q)}&limit=60`),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/* ---------- Collaboration ---------- */

export interface Person {
  email: string;
  name: string;
  role: string;
}

export function useUsers(enabled = true) {
  return useQuery({
    queryKey: ["users"] as const,
    queryFn: () => api<{ users: Person[] }>("/api/users"),
    enabled,
    staleTime: 10 * 60_000,
  });
}

export function useComments(isbn: string, enabled = true) {
  return useQuery({
    enabled,
    queryKey: queryKeys.comments(isbn),
    queryFn: () => api<{ comments: CommentView[] }>(`/api/titles/${encodeURIComponent(isbn)}/comments`),
    staleTime: 30_000,
  });
}

/** Unread mentions/replies badge: cheap count, refreshed every 30 s while the tab is visible. */
export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.unread,
    queryFn: () => api<{ unread: number }>("/api/notifications?count=1"),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    staleTime: 5_000,
  });
}

export function useNotifications(enabled: boolean) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: async () => {
      const res = await api<{ items: NotificationView[]; unread: number }>("/api/notifications");
      // Keep the badge in step with the list.
      qc.setQueryData(queryKeys.unread, { unread: res.unread });
      return res;
    },
    enabled,
    staleTime: 10_000,
  });
}

/** A work group assigned to the signed-in person (a My Desk tab). */
export type DeskGroup = GroupDefinition & { id: string; name: string };

export function useDesk() {
  return useQuery({
    queryKey: queryKeys.desk,
    queryFn: () => api<{ changed: ChangedTitle[]; groups: DeskGroup[]; tabOrder: string[] }>("/api/desk"),
    staleTime: 30_000,
  });
}

export function useTrends(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.trends,
    queryFn: () => api<TrendsView>("/api/trends"),
    enabled,
    staleTime: 10 * 60_000,
  });
}

/** Display name for an e-mail (from the team list), falling back to the e-mail's first part. */
export function usePersonName() {
  const users = useUsers();
  const names = useMemo(() => new Map((users.data?.users ?? []).map((u) => [u.email, u.name])), [users.data]);
  return useCallback((email: string | null | undefined) => (email ? (names.get(email) ?? email.split("@")[0]!) : "Someone"), [names]);
}

export function useChannelInsights(enabled: boolean) {
  return useQuery({
    queryKey: ["insights", "channels"] as const,
    queryFn: () => api<ChannelInsights>("/api/insights"),
    enabled,
    staleTime: 60_000,
  });
}
