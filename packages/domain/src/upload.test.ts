import { describe, expect, it } from "vitest";
import { buildExportRows } from "./export";
import { buildTitleGrid } from "./grid";
import { accountKey, estimateId } from "./identity";
import { SHEET_COLUMNS } from "./sheet";
import { missingUploadColumns, planUpload, type UploadContext, type UploadRow } from "./upload";
import type { AccountRef, EstimateRecord } from "./types";

const ISBN = "9780000000001";
const known: AccountRef = {
  channelId: "MASSMER",
  channelName: "Mass Merchandise",
  orgId: "O1",
  orgName: "Org One",
  accountId: "A1",
  accountName: "Account One",
};

function ctx(existing: EstimateRecord[] = [], titleAccounts: AccountRef[] = []): UploadContext {
  return {
    knownIsbns: new Set([ISBN]),
    existingEstimates: new Map(existing.map((e) => [estimateId(e.isbn, e.level, e), e])),
    titleAccountKeys: () => new Set(titleAccounts.map(accountKey)),
    findReferenceAccount: (c, o, a) =>
      c === known.channelId && o === known.orgId && a === known.accountId ? known : null,
  };
}

const row = (n: number, cells: Partial<Record<keyof typeof SHEET_COLUMNS, unknown>>): UploadRow => ({
  sheet: "Sheet1",
  rowNumber: n,
  cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [SHEET_COLUMNS[k as keyof typeof SHEET_COLUMNS], v])),
});

describe("planUpload", () => {
  it("maps total, all-accounts and account rows to channel, org and account levels", () => {
    const plan = planUpload(
      [
        row(2, { isbn: ISBN, channelId: "MASSMER", channelName: "Mass Merchandise", orgName: "Total_Organizations", orgId: "Total Organizations", accountName: "Total Accounts", accountId: "Total Accounts", laydownGoal: "1000" }),
        row(3, { isbn: ISBN, channelId: "MASSMER", channelName: "Mass Merchandise", orgName: "Org One", orgId: "O1", accountName: "All Accounts", accountId: "All Accounts", laydownEstimate: 250.6 }),
        row(4, { isbn: ISBN, channelId: "MASSMER", channelName: "whatever", orgName: "x", orgId: "O1", accountName: "y", accountId: "A1", salesNotes: " hello " }),
      ],
      ctx(),
    );
    expect(plan.errors).toEqual([]);
    expect(plan.changes.map((c) => c.level)).toEqual(["channel", "org", "account"]);
    expect(plan.changes[1]!.set).toEqual({ laydownEstimate: 251 });
    // New account names come from reference data.
    expect(plan.changes[2]!.ref.accountName).toBe("Account One");
    expect(plan.changes[2]!.set).toEqual({ salesNotes: "hello" });
  });

  it("keeps existing values for blank cells and skips unchanged rows", () => {
    const existing: EstimateRecord = { isbn: ISBN, level: "account", ...known, laydownGoal: 5, laydownEstimate: 7, sixMonthEstimate: null, salesNotes: "" };
    const plan = planUpload(
      [
        row(2, { isbn: ISBN, channelId: "MASSMER", channelName: "Mass Merchandise", orgName: "Org One", orgId: "O1", accountName: "Account One", accountId: "A1", laydownGoal: "5", laydownEstimate: "" }),
        row(3, { isbn: ISBN, channelId: "MASSMER", channelName: "Mass Merchandise", orgName: "Org One", orgId: "O1", accountName: "Account One", accountId: "A1", sixMonthEstimate: "9" }),
      ],
      ctx([existing], [known]),
    );
    expect(plan.unchangedRows).toBe(1);
    expect(plan.changes).toHaveLength(1);
    expect(plan.changes[0]!.set).toEqual({ sixMonthEstimate: 9 });
  });

  it("reports unknown ISBNs, bad numbers and invalid account combinations", () => {
    const plan = planUpload(
      [
        row(2, { isbn: "123", channelId: "MASSMER" }),
        row(3, { isbn: ISBN, channelId: "MASSMER", orgId: "O1", accountId: "A1", laydownGoal: "abc" }),
        row(4, { isbn: ISBN, channelId: "MASSMER", orgId: "O1", accountId: "NOPE", laydownGoal: "1" }),
      ],
      ctx(),
    );
    expect(plan.changes).toHaveLength(0);
    expect(plan.errors.map((e) => e.rowNumber)).toEqual([2, 3, 4]);
  });

  it("detects missing required columns", () => {
    expect(missingUploadColumns(["ISBN", "Laydown Goal"])).toContain("DISTRIBUTION CHANNEL");
    expect(missingUploadColumns(Object.values(SHEET_COLUMNS))).toEqual([]);
  });

  it("round-trips: an exported file re-uploads without changes", () => {
    const estimates: EstimateRecord[] = [
      { isbn: ISBN, level: "channel", ...known, orgId: null, orgName: null, accountId: null, accountName: null, laydownGoal: 900, laydownEstimate: null, sixMonthEstimate: null, salesNotes: "big push" },
      { isbn: ISBN, level: "account", ...known, laydownGoal: 5, laydownEstimate: 7, sixMonthEstimate: 12, salesNotes: "note" },
    ];
    const grid = buildTitleGrid({ facts: [{ ...known, initialOrder: 40 }], compFacts: null, estimates });
    const exported = buildExportRows({ isbn: ISBN, title: "T", compIsbn: null, compTitle: null }, grid);
    expect(exported).toHaveLength(3);
    const rows = exported.map((r, i) =>
      ({ sheet: "S", rowNumber: i + 2, cells: Object.fromEntries(Object.entries(r).map(([k, v]) => [SHEET_COLUMNS[k as keyof typeof SHEET_COLUMNS], v])) }),
    );
    const plan = planUpload(rows, ctx(estimates, [known]));
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toEqual([]);
    expect(plan.unchangedRows).toBe(3); // every row, including the blank org row, is unchanged
  });
});
