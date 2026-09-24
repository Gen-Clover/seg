import { describe, expect, it } from "vitest";
import { describeRule, groupTitles, matchesGroup, matchesRule, type GroupTitle } from "./workgroups";

const today = "2026-09-24";
const title = (over: Partial<GroupTitle> = {}): GroupTitle => ({
  isbn: "9780000000001",
  season: "Fall 2026",
  division: "Adult Trade",
  imprint: "Northlight Press",
  format: "Hardcover",
  author: "Ezra Valdez",
  pubDate: "2026-10-10",
  releaseDate: "2026-10-01",
  paperCutOff: null,
  ldc: "2026-09-30",
  usPrice: 24.99,
  compIsbn: null,
  totals: { initialOrder: 3000, laydownGoal: 5000, laydownEstimate: 4000, sixMonthEstimate: null, estimateVsGoal: 1000 },
  ...over,
});

describe("work group rules", () => {
  it("matches text fields case-insensitively, with is / is not", () => {
    expect(matchesRule(title(), { field: "season", op: "in", values: ["fall 2026", "Spring 2027"] }, today)).toBe(true);
    expect(matchesRule(title(), { field: "imprint", op: "notIn", values: ["Northlight Press"] }, today)).toBe(false);
    expect(matchesRule(title({ division: null }), { field: "division", op: "in", values: ["Adult Trade"] }, today)).toBe(false);
    expect(matchesRule(title({ division: null }), { field: "division", op: "notIn", values: ["Adult Trade"] }, today)).toBe(true);
  });

  it("compares dates: before, after, between, relative windows, set / not set", () => {
    expect(matchesRule(title(), { field: "pubDate", op: "between", from: "2026-10-01", to: "2026-10-31" }, today)).toBe(true);
    expect(matchesRule(title(), { field: "pubDate", op: "before", from: null, to: "2026-10-10" }, today)).toBe(false);
    expect(matchesRule(title(), { field: "pubDate", op: "after", from: "2026-10-09", to: null }, today)).toBe(true);
    expect(matchesRule(title(), { field: "ldc", op: "nextDays", days: 7 }, today)).toBe(true);
    expect(matchesRule(title(), { field: "pubDate", op: "nextDays", days: 7 }, today)).toBe(false);
    expect(matchesRule(title({ ldc: "2026-09-20" }), { field: "ldc", op: "pastDays", days: 7 }, today)).toBe(true);
    expect(matchesRule(title(), { field: "paperCutOff", op: "isNotSet" }, today)).toBe(true);
    expect(matchesRule(title(), { field: "paperCutOff", op: "before", from: null, to: "2030-01-01" }, today)).toBe(false);
  });

  it("compares numbers, including totals that are not set yet", () => {
    expect(matchesRule(title(), { field: "initialOrder", op: "atLeast", min: 3000, max: null }, today)).toBe(true);
    expect(matchesRule(title(), { field: "usPrice", op: "between", min: 20, max: 25 }, today)).toBe(true);
    expect(matchesRule(title(), { field: "sixMonthEstimate", op: "atMost", min: null, max: 100 }, today)).toBe(false);
    expect(matchesRule(title(), { field: "sixMonthEstimate", op: "isNotSet" }, today)).toBe(true);
  });

  it("checks planning state flags", () => {
    expect(matchesRule(title(), { field: "hasComparable", op: "is", value: false }, today)).toBe(true);
    expect(matchesRule(title(), { field: "missingEstimates", op: "is", value: true }, today)).toBe(true);
    expect(matchesRule(title(), { field: "belowGoal", op: "is", value: true }, today)).toBe(true);
    expect(matchesRule(title({ totals: { ...title().totals, estimateVsGoal: -5 } }), { field: "belowGoal", op: "is", value: true }, today)).toBe(false);
  });

  it("combines rules with all / any, and orders by pub date", () => {
    const rules = [
      { field: "division" as const, op: "in" as const, values: ["Adult Trade"] },
      { field: "imprint" as const, op: "in" as const, values: ["Atlas Image"] },
    ];
    expect(matchesGroup(title(), { match: "all", rules }, today)).toBe(false);
    expect(matchesGroup(title(), { match: "any", rules }, today)).toBe(true);
    expect(matchesGroup(title(), { match: "all", rules: [] }, today)).toBe(true);
    const list = groupTitles([title({ isbn: "b", pubDate: null }), title({ isbn: "a", pubDate: "2026-11-01" }), title({ isbn: "c" })], { match: "all", rules: [] }, today);
    expect(list.map((t) => t.isbn)).toEqual(["c", "a", "b"]);
  });

  it("describes rules in plain words", () => {
    expect(describeRule({ field: "season", op: "in", values: ["Fall 2026", "Spring 2027"] })).toBe("Season is Fall 2026 or Spring 2027");
    expect(describeRule({ field: "ldc", op: "nextDays", days: 30 })).toBe("LDC in the next 30 days");
    expect(describeRule({ field: "hasComparable", op: "is", value: false })).toBe("Not: has a comparable title");
  });
});
