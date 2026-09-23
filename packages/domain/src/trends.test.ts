import { describe, expect, it } from "vitest";
import { totalsAtPoints, weeklyPoints, type HistoryChange } from "./trends";
import type { AccountFact, EstimateRecord } from "./types";

const fact = (accountId: string, initialOrder: number): AccountFact => ({
  channelId: "MASSMER",
  channelName: "Mass",
  orgId: "O1",
  orgName: "Org 1",
  accountId,
  accountName: `Account ${accountId}`,
  initialOrder,
});
const refOf = (f: AccountFact) => ({
  channelId: f.channelId,
  channelName: f.channelName,
  orgId: f.orgId,
  orgName: f.orgName,
  accountId: f.accountId,
  accountName: f.accountName,
});
const a1 = fact("A1", 10);
const a2 = fact("A2", 20);
const est = (f: AccountFact, laydownGoal: number | null): EstimateRecord => ({
  isbn: "9780000000001",
  level: "account",
  ...refOf(f),
  laydownGoal,
  laydownEstimate: null,
  sixMonthEstimate: null,
  salesNotes: "",
});
const change = (f: AccountFact, oldValue: number | null, changedAt: string): HistoryChange => ({
  level: "account",
  ref: refOf(f),
  field: "laydownGoal",
  oldValue,
  changedAt,
});

describe("totalsAtPoints", () => {
  it("walks history backwards to rebuild each week's totals", () => {
    // Today: A1 = 150 (was 100 before Jan 20, blank before Jan 10); A2 = 50 (set Jan 12).
    const series = totalsAtPoints({
      isbn: "9780000000001",
      facts: [a1, a2],
      compFacts: null,
      estimates: [est(a1, 150), est(a2, 50)],
      history: [change(a1, null, "2026-01-10T00:00:00Z"), change(a2, null, "2026-01-12T00:00:00Z"), change(a1, 100, "2026-01-20T00:00:00Z")],
      points: ["2026-01-05T00:00:00Z", "2026-01-15T00:00:00Z", "2026-01-25T00:00:00Z"],
    });
    expect(series.laydownGoal).toEqual([null, 150, 200]);
    expect(series.laydownEstimate).toEqual([null, null, null]);
  });
});

describe("weeklyPoints", () => {
  it("returns Monday midnights (UTC) then now", () => {
    const pts = weeklyPoints(new Date("2026-09-23T15:00:00Z"), 3); // a Wednesday
    expect(pts).toEqual(["2026-09-07T00:00:00.000Z", "2026-09-14T00:00:00.000Z", "2026-09-21T00:00:00.000Z", "2026-09-23T15:00:00.000Z"]);
  });
});
