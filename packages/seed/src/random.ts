/** Deterministic random numbers so the demo data is identical on every run. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Mulberry32. Returns a float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }

  /** Picks n distinct items. */
  sample<T>(items: readonly T[], n: number): T[] {
    const copy = [...items];
    const out: T[] = [];
    while (out.length < n && copy.length) out.push(copy.splice(Math.floor(this.next() * copy.length), 1)[0]!);
    return out;
  }

  /** Picks with the given weights. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    const total = items.reduce((s, i) => s + weight(i), 0);
    let r = this.next() * total;
    for (const item of items) {
      r -= weight(item);
      if (r <= 0) return item;
    }
    return items[items.length - 1]!;
  }

  /** Log-normal-ish positive number around `median`. */
  skewed(median: number, spread = 1): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return median * Math.exp(z * spread * 0.6);
  }
}

/** Valid EAN-13 from a 12-digit body. */
export function ean13(body12: string): string {
  const digits = body12.split("").map(Number);
  const sum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
  return body12 + ((10 - (sum % 10)) % 10);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
export const yyyymmdd = (d: Date) => isoDate(d).replace(/-/g, "");
/** Legacy Mongo/BigQuery text format, e.g. "8/17/2026 12:00:00 AM". */
export const legacyDateTime = (d: Date) =>
  `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} 12:00:00 AM`;
