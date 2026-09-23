import { describe, expect, it } from "vitest";
import { buildTitleGrid, titleTotals } from "./grid";
import type { AccountFact, CompAccountFact, EstimateRecord } from "./types";

const acc = (
  channelId: string,
  orgId: string,
  accountId: string,
  initialOrder = 0,
  extra: Partial<AccountFact> = {},
): AccountFact => ({
  channelId,
  channelName: `${channelId} name`,
  orgId,
  orgName: `Org ${orgId}`,
  accountId,
  accountName: `Account ${accountId}`,
  initialOrder,
  ...extra,
});

const est = (
  level: EstimateRecord["level"],
  ref: Partial<EstimateRecord>,
  values: Partial<EstimateRecord>,
): EstimateRecord => ({
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

describe("buildTitleGrid", () => {
  const facts = [
    acc("MASSMER", "O1", "A1", 100),
    acc("MASSMER", "O1", "A2", 50),
    acc("MASSMER", "O2", "A3", 10),
    acc("NATCHAIN", "O9", "A9", 500),
  ];

  it("groups accounts under channels and organizations and sums initial orders", () => {
    const grid = buildTitleGrid({ facts, compFacts: null, estimates: [] });
    expect(grid.channels.map((c) => c.ref.channelId)).toEqual(["MASSMER", "NATCHAIN"]);
    const massmer = grid.channels[0]!;
    expect(massmer.metrics.initialOrder).toBe(160);
    expect(massmer.orgs.map((o) => o.metrics.initialOrder)).toEqual([150, 10]);
    expect(massmer.accountLevel).toBe(true);
    expect(grid.channels[1]!.accountLevel).toBe(false);
    expect(grid.totals.metrics.initialOrder).toBe(660);
    expect(grid.totals.metrics.compGross).toBeNull();
  });

  it("rolls estimates up: account sums, overridden by org, overridden by channel", () => {
    const m = { channelId: "MASSMER", channelName: "MASSMER name" };
    const estimates = [
      est("account", { ...m, orgId: "O1", orgName: "Org O1", accountId: "A1", accountName: "Account A1" }, { laydownGoal: 10 }),
      est("account", { ...m, orgId: "O1", orgName: "Org O1", accountId: "A2", accountName: "Account A2" }, { laydownGoal: 5 }),
      est("account", { ...m, orgId: "O2", orgName: "Org O2", accountId: "A3", accountName: "Account A3" }, { laydownGoal: 7 }),
      est("org", { ...m, orgId: "O2", orgName: "Org O2" }, { laydownGoal: 100 }),
    ];
    let grid = buildTitleGrid({ facts, compFacts: null, estimates });
    const massmer = grid.channels[0]!;
    expect(massmer.orgs[0]!.rolled.laydownGoal).toBe(15); // sum of accounts
    expect(massmer.orgs[1]!.rolled.laydownGoal).toBe(100); // org value wins over account 7
    expect(massmer.rolled.laydownGoal).toBe(115);
    expect(grid.totals.rolled.laydownGoal).toBe(115);
    expect(grid.totals.rolled.laydownEstimate).toBeNull();

    grid = buildTitleGrid({ facts, compFacts: null, estimates: [...estimates, est("channel", m, { laydownGoal: 1000 })] });
    expect(grid.channels[0]!.rolled.laydownGoal).toBe(1000);
    expect(titleTotals(grid).laydownGoal).toBe(1000);
  });

  it("treats an explicit 0 as a set value", () => {
    const m = { channelId: "MASSMER", channelName: "MASSMER name", orgId: "O1", orgName: "Org O1" };
    const grid = buildTitleGrid({
      facts,
      compFacts: null,
      estimates: [
        est("account", { ...m, accountId: "A1", accountName: "Account A1" }, { laydownEstimate: 40 }),
        est("org", m, { laydownEstimate: 0 }),
      ],
    });
    expect(grid.channels[0]!.orgs[0]!.rolled.laydownEstimate).toBe(0);
  });

  it("adds comp-only accounts and fills comp figures, zero where the comp title has no data", () => {
    const comp: CompAccountFact[] = [
      { ...acc("MASSMER", "O1", "A1"), initialOrder: 80, grossUnits: 120, netUnits: 90, readerlinkPos: 0 },
      { ...acc("RETINDEP", "O5", "A5"), initialOrder: 5, grossUnits: 6, netUnits: 4, readerlinkPos: 0 },
    ];
    const grid = buildTitleGrid({ facts, compFacts: comp, estimates: [] });
    const retindep = grid.channels.find((c) => c.ref.channelId === "RETINDEP")!;
    expect(retindep.orgs[0]!.accounts[0]!.compOnly).toBe(true);
    expect(retindep.metrics.initialOrder).toBe(0);
    const a2 = grid.channels[0]!.orgs[0]!.accounts.find((a) => a.ref.accountId === "A2")!;
    expect(a2.metrics.compGross).toBe(0);
    expect(grid.totals.metrics.compGross).toBe(126);
  });

  it("keeps channel- and organization-level estimates that have no accounts", () => {
    const grid = buildTitleGrid({
      facts: [],
      compFacts: null,
      estimates: [
        est("channel", { channelId: "EDULIB", channelName: "Education & Library" }, { laydownEstimate: 300 }),
        est("org", { channelId: "SMIND", channelName: "Small Independents", orgId: "O7", orgName: "Org 7" }, { laydownEstimate: 20 }),
      ],
    });
    expect(grid.channels.map((c) => c.ref.channelId)).toEqual(["EDULIB", "SMIND"]);
    expect(grid.totals.rolled.laydownEstimate).toBe(320);
  });

  it("treats the same account id with a different name as a separate account", () => {
    const grid = buildTitleGrid({
      facts: [acc("MASSMER", "O1", "A1", 1), acc("MASSMER", "O1", "A1", 2, { accountName: "Renamed" })],
      compFacts: null,
      estimates: [],
    });
    expect(grid.channels[0]!.orgs[0]!.accounts).toHaveLength(2);
  });

  it("falls back to the channel id for the name and sorts 'not defined' last", () => {
    const grid = buildTitleGrid({
      facts: [
        { ...acc("ONLRET", "O1", "A1", 1), channelName: null },
        { ...acc("X", "O2", "A2", 1), channelId: null, channelName: null },
      ],
      compFacts: null,
      estimates: [],
    });
    expect(grid.channels[0]!.ref.channelName).toBe("ONLRET");
    expect(grid.channels[1]!.ref.channelId).toBeNull();
  });
});
