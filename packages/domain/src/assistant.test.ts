import { describe, expect, it } from "vitest";
import { parseAssistantQuery, type FacetValues } from "./assistant";

const facets: FacetValues = {
  season: ["Spring 2026", "Fall 2026"],
  division: ["Adult Trade", "Children's"],
  imprint: ["Northlight Press"],
  format: ["Hardcover", "Board Book"],
};
const q = (t: string) => parseAssistantQuery(t, facets);

describe("parseAssistantQuery", () => {
  it("understands the common questions", () => {
    expect(q("help")).toEqual({ kind: "help" });
    expect(q("")).toEqual({ kind: "help" });
    expect(q("What is due this week?")).toEqual({ kind: "due", days: 7 });
    expect(q("deadlines in the next 30 days")).toEqual({ kind: "due", days: 30 });
    expect(q("anything overdue")).toEqual({ kind: "due", days: 14 });
    expect(q("titles below goal")).toEqual({ kind: "belowGoal" });
    expect(q("which titles have no comp")).toEqual({ kind: "noComp" });
    expect(q("what changed since I last looked")).toEqual({ kind: "changed" });
    expect(q("my mentions")).toEqual({ kind: "mentions" });
  });

  it("recognises ISBNs, history questions and groups", () => {
    expect(q("show 9781955005302")).toEqual({ kind: "title", isbn: "9781955005302" });
    expect(q("who changed 9781955005302?")).toEqual({ kind: "history", isbn: "9781955005302" });
    expect(q("Spring 2026 summary")).toEqual({ kind: "group", facet: "season", value: "Spring 2026" });
    expect(q("how is children's doing")).toEqual({ kind: "group", facet: "division", value: "Children's" });
  });

  it("falls back to a title search", () => {
    expect(q("Field Guide to Dragons")).toEqual({ kind: "search", text: "Field Guide to Dragons" });
  });
});
