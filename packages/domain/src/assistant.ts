/**
 * Ask Abrams assistant: turns a typed question into an intent, with plain rules (no AI service).
 * The server answers each intent from the app's own data.
 */

export type AssistantIntent =
  | { kind: "help" }
  | { kind: "due"; days: number }
  | { kind: "belowGoal" }
  | { kind: "noComp" }
  | { kind: "changed" }
  | { kind: "mentions" }
  | { kind: "title"; isbn: string }
  | { kind: "history"; isbn: string }
  | { kind: "group"; facet: "season" | "division" | "imprint" | "format"; value: string }
  | { kind: "search"; text: string };

export interface FacetValues {
  season: string[];
  division: string[];
  imprint: string[];
  format: string[];
}

const ISBN = /\b(97[89]\d{10})\b/;
const has = (text: string, ...words: string[]) => words.some((w) => text.includes(w));

/** Days in phrases like "next 30 days", "this week", "this month", "today". */
function daysIn(text: string): number {
  const n = /(\d{1,3})\s*days?/.exec(text);
  if (n) return Math.min(365, Math.max(1, Number(n[1])));
  if (has(text, "today")) return 0;
  if (has(text, "this week", "7 day", "week")) return 7;
  if (has(text, "this month", "month")) return 30;
  return 14;
}

/** Longest facet value mentioned in the text (so "Spring 2026" beats "Spring"). */
function findFacet(text: string, facets: FacetValues): { facet: keyof FacetValues; value: string } | null {
  let best: { facet: keyof FacetValues; value: string } | null = null;
  for (const facet of ["season", "division", "imprint", "format"] as const) {
    for (const value of facets[facet]) {
      if (value && text.includes(value.toLowerCase()) && (!best || value.length > best.value.length)) best = { facet, value };
    }
  }
  return best;
}

export function parseAssistantQuery(input: string, facets: FacetValues): AssistantIntent {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  if (!text || has(text, "help", "what can you", "how do i", "commands") || text === "?" || text === "hi" || text === "hello") return { kind: "help" };

  const isbn = ISBN.exec(text)?.[1];
  if (isbn) return has(text, "who changed", "history", "changes", "changed") ? { kind: "history", isbn } : { kind: "title", isbn };

  if (has(text, "mention", "unread", "my messages", "notification")) return { kind: "mentions" };
  if (has(text, "changed", "what's new", "whats new", "updates", "edited")) return { kind: "changed" };
  if (has(text, "no comp", "without comp", "missing comp", "comparable")) return { kind: "noComp" };
  if (has(text, "below goal", "under goal", "short of goal", "gap", "behind goal", "off goal")) return { kind: "belowGoal" };
  if (has(text, "due", "deadline", "cut-off", "cut off", "cutoff", "ldc", "overdue", "at risk")) return { kind: "due", days: daysIn(text) };

  const facet = findFacet(text, facets);
  if (facet) return { kind: "group", ...facet };

  return { kind: "search", text: input.trim() };
}
