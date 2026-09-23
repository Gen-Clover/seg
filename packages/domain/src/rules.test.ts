import { describe, expect, it } from "vitest";
import { isAccountLevelChannel, isTitleInScope, seasonSortKey } from "./config";
import { accountKey, clean, estimateId, refForLevel } from "./identity";
import { parseEstimateInput, sanitizeEstimateTyping, sumNullable } from "./numbers";

describe("numbers", () => {
  it("parses estimate input", () => {
    expect(parseEstimateInput("")).toBeNull();
    expect(parseEstimateInput(" 1,250 ")).toBe(1250);
    expect(parseEstimateInput("12.6")).toBe(13);
    expect(parseEstimateInput(0)).toBe(0);
    expect(parseEstimateInput("-3")).toBeUndefined();
    expect(parseEstimateInput("abc")).toBeUndefined();
    expect(sanitizeEstimateTyping("1a2.3")).toBe("123");
    expect(sumNullable([null, null])).toBeNull();
    expect(sumNullable([null, 2, 3])).toBe(5);
  });
});

describe("identity", () => {
  it("normalizes blanks and 'NULL' to null", () => {
    expect(clean("  ")).toBeNull();
    expect(clean("NULL")).toBeNull();
    expect(clean(" x ")).toBe("x");
  });

  it("builds keys from id and name, with channel name falling back to id", () => {
    const a = { channelId: "ONLRET", channelName: null, orgId: "1", orgName: "A", accountId: "2", accountName: "B" };
    const b = { ...a, channelName: "ONLRET" };
    expect(accountKey(a)).toBe(accountKey(b));
    expect(accountKey(a)).not.toBe(accountKey({ ...a, accountName: "C" }));
    expect(estimateId("9", "org", refForLevel("org", a))).toBe(estimateId("9", "org", { ...a, accountId: "zzz" }));
  });
});

describe("config rules", () => {
  it("knows account-level channels", () => {
    expect(isAccountLevelChannel(" massmer ")).toBe(true);
    expect(isAccountLevelChannel("NATCHAIN")).toBe(false);
  });

  it("orders seasons by year then spring before fall", () => {
    const seasons = ["Fall 2025", "Spring 2026", "Spring 2025"];
    expect([...seasons].sort((a, b) => seasonSortKey(a) - seasonSortKey(b))).toEqual(["Spring 2025", "Fall 2025", "Spring 2026"]);
  });

  it("applies the legacy catalog scope rules", () => {
    const base = { season: "Fall 2025", ipmFormat: "HC", format: "Hardcover", division: "Abrams", imprint: "Abrams Image", isbn: "978" };
    expect(isTitleInScope(base)).toBe(true);
    expect(isTitleInScope({ ...base, season: "Fall 2024" })).toBe(false);
    expect(isTitleInScope({ ...base, season: "Winter 2026" })).toBe(false);
    expect(isTitleInScope({ ...base, ipmFormat: "EB" })).toBe(false);
    expect(isTitleInScope({ ...base, format: "catalog" })).toBe(false);
    expect(isTitleInScope({ ...base, format: "Floor Display 12-copy" })).toBe(false);
    expect(isTitleInScope({ ...base, format: "ARC" })).toBe(false);
    expect(isTitleInScope({ ...base, imprint: " " })).toBe(false);
  });
});
