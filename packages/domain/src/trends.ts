import { EMPTY_ESTIMATE, buildTitleGrid, titleTotals } from "./grid";
import { estimateId } from "./identity";
import type { AccountFact, AccountRef, CompAccountFact, EstimateNumberField, EstimateRecord, Level } from "./types";
import type { DomainConfig } from "./config";

/** One saved change from the history log (only number fields matter for totals). */
export interface HistoryChange {
  level: Level;
  ref: AccountRef;
  field: string;
  oldValue: number | string | null;
  changedAt: string;
}

export interface TotalsSeries {
  laydownGoal: (number | null)[];
  laydownEstimate: (number | null)[];
  sixMonthEstimate: (number | null)[];
}

const NUMBER_FIELDS = new Set<string>(["laydownGoal", "laydownEstimate", "sixMonthEstimate"]);

/**
 * A title's totals as they were at each point in time (points in ascending order).
 * Starts from today's estimates and walks the history backwards, undoing every change made
 * after each point, then applies the normal roll-up rules — so past totals are computed exactly
 * like today's, including organization and channel overrides.
 */
export function totalsAtPoints(input: {
  isbn: string;
  facts: AccountFact[];
  compFacts: CompAccountFact[] | null;
  estimates: EstimateRecord[];
  history: HistoryChange[];
  points: string[];
  config?: DomainConfig;
}): TotalsSeries {
  const state = new Map<string, EstimateRecord>();
  for (const e of input.estimates) state.set(estimateId(e.isbn, e.level, e), { ...e });
  const changes = input.history.filter((h) => NUMBER_FIELDS.has(h.field)).sort((a, b) => b.changedAt.localeCompare(a.changedAt));

  const out: TotalsSeries = { laydownGoal: [], laydownEstimate: [], sixMonthEstimate: [] };
  let next = 0;
  for (let i = input.points.length - 1; i >= 0; i--) {
    const point = input.points[i]!;
    while (next < changes.length && changes[next]!.changedAt > point) {
      const c = changes[next++]!;
      const id = estimateId(input.isbn, c.level, c.ref);
      let rec = state.get(id);
      if (!rec) {
        rec = { isbn: input.isbn, level: c.level, ...c.ref, ...EMPTY_ESTIMATE };
        state.set(id, rec);
      }
      const old = c.oldValue === null || c.oldValue === "" ? null : Number(c.oldValue);
      rec[c.field as EstimateNumberField] = old === null || Number.isNaN(old) ? null : old;
    }
    const totals = titleTotals(
      buildTitleGrid({ facts: input.facts, compFacts: input.compFacts, estimates: [...state.values()], config: input.config }),
    );
    out.laydownGoal[i] = totals.laydownGoal;
    out.laydownEstimate[i] = totals.laydownEstimate;
    out.sixMonthEstimate[i] = totals.sixMonthEstimate;
  }
  return out;
}

/** The last `weeks` Monday midnights (UTC) before `now`, oldest first, followed by `now` itself. */
export function weeklyPoints(now: Date, weeks: number): string[] {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const points: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(monday);
    d.setUTCDate(d.getUTCDate() - i * 7);
    points.push(d.toISOString());
  }
  points.push(now.toISOString());
  return points;
}
