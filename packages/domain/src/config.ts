/**
 * Business settings that were hard-coded in the legacy app.
 * The server builds this from environment/config; defaults match legacy behaviour.
 */
export interface DomainConfig {
  /** Channels whose organizations can be expanded down to individual accounts. */
  accountLevelChannels: readonly string[];
  /** Lowest season year shown anywhere in the app. */
  minSeasonYear: number;
  /** Season names shown (legacy: Spring and Fall only). */
  seasonNames: readonly string[];
  /** IPM formats included. */
  includedIpmFormats: readonly string[];
  /** FORMAT values excluded (case-insensitive exact match). */
  excludedFormats: readonly string[];
  /** FORMAT values excluded when they contain any of these words (case-insensitive). */
  excludedFormatWords: readonly string[];
}

export const DEFAULT_DOMAIN_CONFIG: DomainConfig = {
  accountLevelChannels: ["MASSMER", "RETINDEP"],
  minSeasonYear: 2025,
  seasonNames: ["Spring", "Fall"],
  includedIpmFormats: ["HC", "PB", "BB"],
  excludedFormats: ["ARC", "Catalog"],
  excludedFormatWords: ["Display"],
};

export function isAccountLevelChannel(
  channelId: string | null | undefined,
  config: DomainConfig = DEFAULT_DOMAIN_CONFIG,
): boolean {
  if (!channelId) return false;
  const id = channelId.trim().toUpperCase();
  return config.accountLevelChannels.some((c) => c.toUpperCase() === id);
}

/** Parses "Fall 2026" → { name: "Fall", year: 2026 }. */
export function parseSeason(season: string | null | undefined): { name: string; year: number } | null {
  if (!season) return null;
  const m = /^\s*([A-Za-z]+)\s+(\d{4})\s*$/.exec(season);
  if (!m) return null;
  return { name: m[1]!, year: Number(m[2]) };
}

/** Sort key for seasons: year, then Spring before Fall. */
export function seasonSortKey(season: string): number {
  const p = parseSeason(season);
  if (!p) return Number.MAX_SAFE_INTEGER;
  const order = p.name.toLowerCase() === "spring" ? 1 : p.name.toLowerCase() === "fall" ? 2 : 3;
  return p.year * 10 + order;
}

/** Legacy title visibility rules for the SEG catalog. */
export function isTitleInScope(
  title: { season: string | null; ipmFormat: string | null; format: string | null; division: string | null; imprint: string | null; isbn: string | null },
  config: DomainConfig = DEFAULT_DOMAIN_CONFIG,
): boolean {
  if (!title.isbn?.trim() || !title.division?.trim() || !title.imprint?.trim()) return false;
  const season = parseSeason(title.season);
  if (!season || season.year < config.minSeasonYear) return false;
  if (!config.seasonNames.some((n) => n.toLowerCase() === season.name.toLowerCase())) return false;
  if (!title.ipmFormat || !config.includedIpmFormats.includes(title.ipmFormat)) return false;
  const format = (title.format ?? "").trim().toLowerCase();
  if (config.excludedFormats.some((f) => f.toLowerCase() === format)) return false;
  if (config.excludedFormatWords.some((w) => format.includes(w.toLowerCase()))) return false;
  return true;
}
