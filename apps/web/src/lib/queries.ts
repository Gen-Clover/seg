"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountRef } from "@seg/domain";
import type { Session } from "@/server/auth/session";
import type { TitleDetail, TitleSearchHit, TitleSummaryRow } from "@/server/services/titles";
import { api } from "./api";

export type { TitleDetail, TitleSearchHit, TitleSummaryRow };

export const queryKeys = {
  me: ["me"] as const,
  summary: ["titles"] as const,
  title: (isbn: string) => ["title", isbn] as const,
  search: (q: string) => ["search", q] as const,
  accounts: (q: string) => ["accounts", q] as const,
  history: (isbn: string, estimateId?: string) => ["history", isbn, estimateId ?? ""] as const,
};

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: () => api<{ user: Session; mainMenuUrl: string | null }>("/api/auth/me"),
    staleTime: 5 * 60_000,
  });
}

export function useSummary() {
  return useQuery({
    queryKey: queryKeys.summary,
    queryFn: () => api<{ titles: TitleSummaryRow[]; generatedAt: string }>("/api/titles"),
    staleTime: 60_000,
  });
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
