import { daysBetween, missingTotals } from "./desk";
import type { TitleTotals } from "./grid";

/**
 * Work groups: named collections of titles that admins define with rules and assign to people.
 * Each group shows as its own tab on My Desk. A title belongs to a group when it matches all of
 * the group's rules (or any of them, when the group says so).
 */

/** Text fields a rule can compare with a list of values. */
export const GROUP_TEXT_FIELDS = ["season", "division", "imprint", "format", "author"] as const;
/** Date fields. */
export const GROUP_DATE_FIELDS = ["pubDate", "releaseDate", "paperCutOff", "ldc"] as const;
/** Number fields (the title's price and its current totals). */
export const GROUP_NUMBER_FIELDS = ["usPrice", "initialOrder", "laydownGoal", "laydownEstimate", "sixMonthEstimate"] as const;
/** Yes / no conditions on the title's planning state. */
export const GROUP_FLAG_FIELDS = ["hasComparable", "missingEstimates", "belowGoal"] as const;

export type GroupTextField = (typeof GROUP_TEXT_FIELDS)[number];
export type GroupDateField = (typeof GROUP_DATE_FIELDS)[number];
export type GroupNumberField = (typeof GROUP_NUMBER_FIELDS)[number];
export type GroupFlagField = (typeof GROUP_FLAG_FIELDS)[number];
export type GroupField = GroupTextField | GroupDateField | GroupNumberField | GroupFlagField;

export type GroupRule =
  | { field: GroupTextField; op: "in" | "notIn"; values: string[] }
  | { field: GroupDateField; op: "before" | "after" | "between"; from: string | null; to: string | null }
  | { field: GroupDateField; op: "nextDays" | "pastDays"; days: number }
  | { field: GroupDateField | GroupNumberField; op: "isSet" | "isNotSet" }
  | { field: GroupNumberField; op: "atLeast" | "atMost" | "between"; min: number | null; max: number | null }
  | { field: GroupFlagField; op: "is"; value: boolean };

export interface GroupDefinition {
  /** "all" = every rule must match; "any" = at least one. */
  match: "all" | "any";
  rules: GroupRule[];
}

/** The summary fields a rule can look at. */
export interface GroupTitle {
  isbn: string;
  season: string | null;
  division: string | null;
  imprint: string | null;
  format: string | null;
  author: string | null;
  pubDate: string | null;
  releaseDate: string | null;
  paperCutOff: string | null;
  ldc: string | null;
  usPrice: number | null;
  compIsbn: string | null;
  totals: TitleTotals;
}

export const GROUP_FIELD_LABELS: Record<GroupField, string> = {
  season: "Season",
  division: "Division",
  imprint: "Imprint",
  format: "Format",
  author: "Author",
  pubDate: "Pub date",
  releaseDate: "Release date",
  paperCutOff: "Paper cut-off",
  ldc: "LDC",
  usPrice: "US price",
  initialOrder: "Initial orders",
  laydownGoal: "Laydown goal",
  laydownEstimate: "Laydown estimate",
  sixMonthEstimate: "6-month estimate",
  hasComparable: "Has a comparable title",
  missingEstimates: "Missing estimates",
  belowGoal: "Below goal",
};

const textValue = (t: GroupTitle, f: GroupTextField) => t[f];
const dateValue = (t: GroupTitle, f: GroupDateField) => (t[f] ? t[f]!.slice(0, 10) : null);
function numberValue(t: GroupTitle, f: GroupNumberField): number | null {
  if (f === "usPrice") return t.usPrice;
  return t.totals[f];
}

const norm = (s: string) => s.trim().toLowerCase();

/** Whether one title matches one rule. `today` is YYYY-MM-DD (the viewer's local date). */
export function matchesRule(t: GroupTitle, rule: GroupRule, today: string): boolean {
  switch (rule.op) {
    case "in":
    case "notIn": {
      const v = textValue(t, rule.field);
      const hit = v !== null && rule.values.some((x) => norm(x) === norm(v));
      return rule.op === "in" ? hit : !hit;
    }
    case "isSet":
    case "isNotSet": {
      const v = (GROUP_DATE_FIELDS as readonly string[]).includes(rule.field)
        ? dateValue(t, rule.field as GroupDateField)
        : numberValue(t, rule.field as GroupNumberField);
      return rule.op === "isSet" ? v !== null : v === null;
    }
    case "before":
    case "after":
    case "between": {
      if ("min" in rule) {
        const v = numberValue(t, rule.field);
        if (v === null) return false;
        return (rule.min === null || v >= rule.min) && (rule.max === null || v <= rule.max);
      }
      const v = dateValue(t, rule.field);
      if (v === null) return false;
      if (rule.op === "before") return rule.to !== null && v < rule.to;
      if (rule.op === "after") return rule.from !== null && v > rule.from;
      return (rule.from === null || v >= rule.from) && (rule.to === null || v <= rule.to);
    }
    case "nextDays":
    case "pastDays": {
      const v = dateValue(t, rule.field);
      if (v === null) return false;
      const d = daysBetween(today, v);
      return rule.op === "nextDays" ? d >= 0 && d <= rule.days : d <= 0 && -d <= rule.days;
    }
    case "atLeast":
    case "atMost": {
      const v = numberValue(t, rule.field);
      if (v === null) return false;
      if (rule.op === "atLeast") return rule.min !== null && v >= rule.min;
      return rule.max !== null && v <= rule.max;
    }
    case "is": {
      const actual =
        rule.field === "hasComparable"
          ? !!t.compIsbn
          : rule.field === "missingEstimates"
            ? missingTotals(t.totals).length > 0
            : t.totals.estimateVsGoal !== null && t.totals.estimateVsGoal > 0;
      return actual === rule.value;
    }
  }
}

/** Whether a title belongs to a group. A group without rules contains every title. */
export function matchesGroup(t: GroupTitle, group: GroupDefinition, today: string): boolean {
  if (!group.rules.length) return true;
  return group.match === "any" ? group.rules.some((r) => matchesRule(t, r, today)) : group.rules.every((r) => matchesRule(t, r, today));
}

/** The titles of a group, soonest publication first (titles without a date last). */
export function groupTitles<T extends GroupTitle>(titles: readonly T[], group: GroupDefinition, today: string): T[] {
  return titles
    .filter((t) => matchesGroup(t, group, today))
    .sort((a, b) => (a.pubDate ?? "9999").localeCompare(b.pubDate ?? "9999") || a.isbn.localeCompare(b.isbn));
}

/** A short, readable description of a rule, e.g. "Season is Fall 2026 or Spring 2027". */
export function describeRule(rule: GroupRule): string {
  const label = GROUP_FIELD_LABELS[rule.field];
  const num = (n: number | null) => (n === null ? "…" : n.toLocaleString("en-US"));
  switch (rule.op) {
    case "in":
      return `${label} is ${rule.values.length ? rule.values.join(" or ") : "(none chosen)"}`;
    case "notIn":
      return `${label} is not ${rule.values.length ? rule.values.join(" or ") : "(none chosen)"}`;
    case "isSet":
      return `${label} is set`;
    case "isNotSet":
      return `${label} is not set`;
    case "before":
      return `${label} before ${rule.to ?? "…"}`;
    case "after":
      return `${label} after ${rule.from ?? "…"}`;
    case "between":
      return "min" in rule ? `${label} between ${num(rule.min)} and ${num(rule.max)}` : `${label} between ${rule.from ?? "…"} and ${rule.to ?? "…"}`;
    case "nextDays":
      return `${label} in the next ${rule.days} days`;
    case "pastDays":
      return `${label} in the last ${rule.days} days`;
    case "atLeast":
      return `${label} at least ${num(rule.min)}`;
    case "atMost":
      return `${label} at most ${num(rule.max)}`;
    case "is":
      return rule.value ? label : `Not: ${label.toLowerCase()}`;
  }
}
