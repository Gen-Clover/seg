/**
 * Estimate inputs are whole, non-negative numbers (legacy behaviour: the grid
 * stripped every non-digit and stored rounded integers).
 */

/** Parses user or file input into an estimate value. Blank → null. Invalid → undefined. */
export function parseEstimateInput(raw: unknown): number | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : undefined;
  }
  const s = String(raw).trim().replace(/,/g, "");
  if (s === "") return null;
  if (!/^\d+(\.\d+)?$/.test(s)) return undefined;
  return Math.round(Number(s));
}

/** Keeps only digits while typing; returns the cleaned text. */
export function sanitizeEstimateTyping(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

/** Sum that ignores nulls; returns null when every value is null. */
export function sumNullable(values: Iterable<number | null | undefined>): number | null {
  let total: number | null = null;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

export function toNumberOrZero(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}
