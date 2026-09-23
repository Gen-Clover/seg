import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const intFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const fmtInt = (n: number | null | undefined, empty = "—") =>
  n === null || n === undefined || Number.isNaN(n) ? empty : intFormat.format(n);

export const fmtCompact = (n: number | null | undefined, empty = "—") =>
  n === null || n === undefined ? empty : Math.abs(n) >= 10_000 ? compactFormat.format(n) : intFormat.format(n);

export const fmtSigned = (n: number | null | undefined, empty = "—") =>
  n === null || n === undefined ? empty : `${n > 0 ? "+" : ""}${intFormat.format(n)}`;

export const fmtMoney = (n: number | null | undefined, empty = "—") =>
  n === null || n === undefined ? empty : currencyFormat.format(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-03-10" → "Mar 10, 2026" (no timezone shifts). */
export function fmtDate(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return empty;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "2026-03-10" → "03/10/26" for dense tables. */
export function fmtDateShort(iso: string | null | undefined, empty = "—"): string {
  if (!iso) return empty;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]!.slice(2)}` : empty;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return fmtDate(iso.slice(0, 10));
}
