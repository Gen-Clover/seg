"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import type { DomainConfig } from "@seg/domain";
import type { Session } from "@/server/auth/session";
import type { PublicSettings } from "@/server/services/settings";
import { api } from "./api";

export type { PublicSettings };
export type Lock = PublicSettings["locks"][number];

const Initial = createContext<PublicSettings | null>(null);

/** Server-rendered settings, so the first paint already has the right switches and wording. */
export function SettingsProvider({ initial, children }: { initial: PublicSettings; children: React.ReactNode }) {
  return <Initial.Provider value={initial}>{children}</Initial.Provider>;
}

export const settingsKey = ["settings"] as const;

/** Admin-controlled settings. Refreshed every minute so switches and banners reach open tabs. */
export function useAppSettings(): PublicSettings {
  const initial = useContext(Initial);
  const query = useQuery({
    queryKey: settingsKey,
    queryFn: () => api<PublicSettings>("/api/settings"),
    initialData: initial ?? undefined,
    initialDataUpdatedAt: 0,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  if (!query.data) throw new Error("useAppSettings needs a SettingsProvider.");
  return query.data;
}

/** The business rules as the domain functions take them. */
export function useDomainConfig(): DomainConfig {
  const { rules } = useAppSettings();
  return useMemo(
    () => ({
      accountLevelChannels: rules.accountLevelChannels,
      minSeasonYear: rules.minSeasonYear,
      seasonNames: rules.seasonNames,
      includedIpmFormats: rules.includedIpmFormats,
      excludedFormats: rules.excludedFormats,
      excludedFormatWords: rules.excludedFormatWords,
      requireDivision: rules.requireDivision,
      requireImprint: rules.requireImprint,
    }),
    [rules],
  );
}

export function lockFor(locks: readonly Lock[], title: { isbn: string; season: string | null }): Lock | null {
  return locks.find((l) => (l.kind === "title" && l.value === title.isbn) || (l.kind === "season" && !!title.season && l.value === title.season)) ?? null;
}

/**
 * Why this person can't change a title, or null when they can. Mirrors the server check
 * (the server still enforces it): viewer role, maintenance, lock, division/imprint access.
 */
export function editBlock(
  user: Pick<Session, "role" | "scope">,
  settings: PublicSettings,
  title: { isbn: string; season: string | null; division: string | null; imprint: string | null },
): { kind: "viewer" | "maintenance" | "lock" | "scope"; message: string; lock?: Lock } | null {
  if (user.role === "viewer") return { kind: "viewer", message: "You have view-only access." };
  if (settings.maintenance.on && user.role !== "admin") return { kind: "maintenance", message: settings.maintenance.message };
  const lock = lockFor(settings.locks, title);
  if (lock) {
    return {
      kind: "lock",
      lock,
      message: `Locked by ${lock.lockedByName} on ${new Date(lock.lockedAt).toLocaleDateString()}${lock.note ? ` — ${lock.note}` : ""}`,
    };
  }
  if (user.role !== "admin" && user.scope) {
    const { divisions, imprints } = user.scope;
    if (divisions.length && !divisions.includes(title.division ?? "")) return { kind: "scope", message: `You can edit ${divisions.join(", ")} titles only.` };
    if (imprints.length && !imprints.includes(title.imprint ?? "")) return { kind: "scope", message: `You can edit ${imprints.join(", ")} titles only.` };
  }
  return null;
}
