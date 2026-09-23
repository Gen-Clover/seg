/** Display helpers for people: initials avatars with a stable colour per person (no image service). */

const PALETTE = ["#2e6be6", "#12a150", "#c97a0a", "#8b5cf6", "#0e9aa7", "#d94680", "#5b6b8c", "#b8532b"];

export function personColor(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function initials(name: string | null | undefined, email?: string): string {
  const source = (name || email?.split("@")[0] || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1]![0] : "")).toUpperCase();
}

/** "jordan.lee@x.com" → "jordan.lee" when no display name is known. */
export const shortName = (email: string | null | undefined) => (email ? email.split("@")[0]! : "Someone");

export const clockTime = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
