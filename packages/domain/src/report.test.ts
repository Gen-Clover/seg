import { describe, expect, it } from "vitest";
import { buildTitleGrid } from "./grid";
import { meetingReportTable } from "./report";
import type { AccountFact, EstimateRecord } from "./types";

const acc = (channelId: string, orgId: string, accountId: string, initialOrder: number): AccountFact => ({
  channelId,
  channelName: `${channelId} name`,
  orgId,
  orgName: `Org ${orgId}`,
  accountId,
  accountName: `Account ${accountId}`,
  initialOrder,
});

const est = (level: EstimateRecord["level"], ref: Partial<EstimateRecord>, values: Partial<EstimateRecord>): EstimateRecord => ({
  isbn: "9780000000001",
  level,
  channelId: null,
  channelName: null,
  orgId: null,
  orgName: null,
  accountId: null,
  accountName: null,
  laydownGoal: null,
  laydownEstimate: null,
  sixMonthEstimate: null,
  salesNotes: "",
  ...ref,
  ...values,
});

describe("meetingReportTable", () => {
  const facts = [acc("MASSMER", "O1", "A1", 100), acc("MASSMER", "O1", "A2", 50), acc("NATCHAIN", "O9", "A9", 500)];
  const a1 = { channelId: "MASSMER", channelName: "MASSMER name", orgId: "O1", orgName: "Org O1", accountId: "A1", accountName: "Account A1" };
  const a2 = { ...a1, accountId: "A2", accountName: "Account A2" };

  it("uses rolled values and combines child notes when the channel has none", () => {
    const grid = buildTitleGrid({
      facts,
      compFacts: null,
      estimates: [
        est("account", a1, { laydownGoal: 10, salesNotes: "Endcap" }),
        est("account", a2, { laydownGoal: 5, salesNotes: "Endcap" }),
        est("channel", { channelId: "NATCHAIN", channelName: "NATCHAIN name" }, { laydownGoal: 300, salesNotes: "Front table" }),
      ],
    });
    const table = meetingReportTable(grid);
    expect(table.channels.map((c) => [c.label, c.values.laydownGoal, c.notes])).toEqual([
      ["MASSMER name", 15, "Endcap"],
      ["NATCHAIN name", 300, "Front table"],
    ]);
    expect(table.total.values.laydownGoal).toBe(315);
    expect(table.total.metrics.initialOrder).toBe(650);
  });
});
