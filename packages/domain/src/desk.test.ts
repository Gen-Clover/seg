import { describe, expect, it } from "vitest";
import { belowGoal, dueSoon, withoutComparable, type DeskTitle } from "./desk";

const totals = (laydownGoal: number | null, laydownEstimate: number | null, sixMonthEstimate: number | null = 1) => ({
  initialOrder: 0,
  laydownGoal,
  laydownEstimate,
  sixMonthEstimate,
  estimateVsGoal: laydownGoal !== null && laydownEstimate !== null ? laydownGoal - laydownEstimate : null,
});
const title = (isbn: string, over: Partial<DeskTitle>): DeskTitle => ({
  isbn,
  pubDate: null,
  paperCutOff: null,
  ldc: null,
  compIsbn: null,
  totals: totals(null, null),
  ...over,
});

const TODAY = "2026-09-23";

describe("dueSoon", () => {
  it("lists titles with a near milestone and empty totals, most urgent first", () => {
    const items = dueSoon(
      [
        title("A", { paperCutOff: "2026-09-30", ldc: "2026-09-25" }), // LDC in 2 days is nearer
        title("B", { paperCutOff: "2026-09-20" }), // 3 days overdue
        title("C", { paperCutOff: "2026-09-26", totals: totals(5, 5, 5) }), // complete: skipped
        title("D", { paperCutOff: "2026-11-30" }), // outside the window
        title("E", { ldc: "2026-08-01" }), // too long overdue
      ],
      TODAY,
      14,
    );
    expect(items.map((i) => [i.isbn, i.milestone, i.daysLeft])).toEqual([
      ["B", "Paper cut-off", -3],
      ["A", "LDC", 2],
    ]);
    expect(items[1]!.missing).toEqual(["Laydown goal", "Laydown estimate"]);
  });
});

describe("belowGoal", () => {
  it("keeps estimates under goal, biggest gap first", () => {
    const items = belowGoal([
      title("A", { totals: totals(100, 90) }),
      title("B", { totals: totals(100, 40) }),
      title("C", { totals: totals(100, 120) }),
      title("D", { totals: totals(100, null) }),
    ]);
    expect(items.map((i) => [i.isbn, i.gap])).toEqual([
      ["B", 60],
      ["A", 10],
    ]);
  });
});

describe("withoutComparable", () => {
  it("puts upcoming publications first", () => {
    const items = withoutComparable(
      [
        title("A", { pubDate: "2026-12-01" }),
        title("B", { pubDate: "2026-10-01" }),
        title("C", { pubDate: "2026-08-01" }),
        title("D", {}),
        title("E", { pubDate: "2026-10-05", compIsbn: "X" }),
      ],
      TODAY,
    );
    expect(items.map((i) => i.isbn)).toEqual(["B", "A", "C", "D"]);
  });
});
