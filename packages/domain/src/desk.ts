import type { TitleTotals } from "./grid";

/** The summary fields My Desk needs for each title. */
export interface DeskTitle {
  isbn: string;
  pubDate: string | null;
  paperCutOff: string | null;
  ldc: string | null;
  compIsbn: string | null;
  totals: TitleTotals;
}

export type Milestone = "Paper cut-off" | "LDC";

export interface DueItem {
  isbn: string;
  milestone: Milestone;
  date: string;
  /** Negative = overdue. */
  daysLeft: number;
  /** Totals still empty, e.g. ["Laydown estimate"]. */
  missing: string[];
}

export interface GapItem {
  isbn: string;
  /** Goal minus estimate (> 0). */
  gap: number;
  /** Estimate as a share of goal (0–1). */
  ratio: number;
}

export interface NoCompItem {
  isbn: string;
  pubDate: string | null;
  /** Days until publication (negative = already published); null without a date. */
  daysToPub: number | null;
}

const DAY = 86_400_000;
const dayNumber = (isoDate: string) => Math.floor(Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) / DAY);
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);

/** Which estimate totals are still empty. */
export function missingTotals(t: TitleTotals): string[] {
  const missing: string[] = [];
  if (t.laydownGoal === null) missing.push("Laydown goal");
  if (t.laydownEstimate === null) missing.push("Laydown estimate");
  if (t.sixMonthEstimate === null) missing.push("6-month estimate");
  return missing;
}

/**
 * Titles whose paper cut-off or LDC falls within the next `windowDays` (or passed within
 * `overdueDays`) and that still have empty totals. The nearer milestone is shown; most urgent first.
 */
export function dueSoon(titles: readonly DeskTitle[], today: string, windowDays: number, overdueDays = 14): DueItem[] {
  const items: DueItem[] = [];
  for (const t of titles) {
    const missing = missingTotals(t.totals);
    if (!missing.length) continue;
    let best: { milestone: Milestone; date: string; daysLeft: number } | null = null;
    for (const [milestone, date] of [["Paper cut-off", t.paperCutOff], ["LDC", t.ldc]] as const) {
      if (!date) continue;
      const daysLeft = daysBetween(today, date);
      if (daysLeft > windowDays || daysLeft < -overdueDays) continue;
      if (!best || daysLeft < best.daysLeft) best = { milestone, date, daysLeft };
    }
    if (best) items.push({ isbn: t.isbn, ...best, missing });
  }
  return items.sort((a, b) => a.daysLeft - b.daysLeft || a.isbn.localeCompare(b.isbn));
}

/**
 * Titles whose laydown estimate is below the laydown goal, biggest gap first.
 * `thresholdPct` ignores small gaps (e.g. 5 = only titles more than 5% short); 0 = any gap.
 */
export function belowGoal(titles: readonly DeskTitle[], thresholdPct = 0): GapItem[] {
  const items: GapItem[] = [];
  for (const t of titles) {
    const { laydownGoal: goal, laydownEstimate: est } = t.totals;
    if (goal === null || est === null || est >= goal) continue;
    if (thresholdPct > 0 && goal > 0 && (goal - est) / goal <= thresholdPct / 100) continue;
    items.push({ isbn: t.isbn, gap: goal - est, ratio: goal > 0 ? est / goal : 0 });
  }
  return items.sort((a, b) => b.gap - a.gap || a.isbn.localeCompare(b.isbn));
}

/** Titles without a comparable title; upcoming publications first, then the rest by date. */
export function withoutComparable(titles: readonly DeskTitle[], today: string): NoCompItem[] {
  const items = titles
    .filter((t) => !t.compIsbn)
    .map((t) => ({ isbn: t.isbn, pubDate: t.pubDate, daysToPub: t.pubDate ? daysBetween(today, t.pubDate) : null }));
  const rank = (i: NoCompItem) => (i.daysToPub === null ? 2 : i.daysToPub >= 0 ? 0 : 1);
  return items.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? a.daysToPub! - b.daysToPub! : rank(a) === 1 ? b.daysToPub! - a.daysToPub! : 0) ||
      a.isbn.localeCompare(b.isbn),
  );
}
