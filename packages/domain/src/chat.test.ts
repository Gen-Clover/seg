import { describe, expect, it } from "vitest";
import { messageExcerpt, roomPreview, type PreviewMessage } from "./chat";

const msg = (over: Partial<PreviewMessage> = {}): PreviewMessage => ({
  authorName: "Rakesh",
  body: "hello",
  createdAt: "2026-09-26T10:00:00.000Z",
  deletedAt: null,
  ...over,
});

describe("messageExcerpt", () => {
  it("keeps short messages as they are", () => {
    expect(messageExcerpt("delete test")).toBe("delete test");
    expect(messageExcerpt("x".repeat(140))).toBe("x".repeat(140));
  });

  it("cuts long messages at 140 characters and adds an ellipsis", () => {
    expect(messageExcerpt("x".repeat(141))).toBe(`${"x".repeat(140)}…`);
  });
});

describe("roomPreview", () => {
  const older = msg({ authorName: "Maya", body: "first", createdAt: "2026-09-26T09:00:00.000Z" });
  const latest = msg({ body: "delete test", createdAt: "2026-09-26T10:00:00.000Z" });

  it("shows the latest message with its author and time", () => {
    expect(roomPreview([older, latest])).toEqual({
      lastMessage: { authorName: "Rakesh", excerpt: "delete test" },
      lastMessageAt: latest.createdAt,
    });
  });

  it("falls back to the previous message when the latest is deleted", () => {
    const deleted = { ...latest, deletedAt: "2026-09-26T10:05:00.000Z" };
    expect(roomPreview([deleted, older])).toEqual({
      lastMessage: { authorName: "Maya", excerpt: "first" },
      lastMessageAt: older.createdAt,
    });
  });

  it("is empty when every message is deleted", () => {
    const gone = "2026-09-26T10:05:00.000Z";
    expect(roomPreview([{ ...older, deletedAt: gone }, { ...latest, deletedAt: gone }])).toEqual({ lastMessage: null, lastMessageAt: null });
    expect(roomPreview([])).toEqual({ lastMessage: null, lastMessageAt: null });
  });

  it("shows the new wording of an edited latest message and keeps its time", () => {
    const edited = { ...latest, body: "delete test (edited)" };
    expect(roomPreview([older, edited])).toEqual({
      lastMessage: { authorName: "Rakesh", excerpt: "delete test (edited)" },
      lastMessageAt: latest.createdAt,
    });
  });

  it("is unchanged when an older message is deleted or edited", () => {
    const before = roomPreview([older, latest]);
    expect(roomPreview([{ ...older, deletedAt: "2026-09-26T10:05:00.000Z" }, latest])).toEqual(before);
    expect(roomPreview([{ ...older, body: "first, edited" }, latest])).toEqual(before);
  });

  it("uses the excerpt rule for long messages", () => {
    expect(roomPreview([msg({ body: "y".repeat(200) })]).lastMessage?.excerpt).toBe(`${"y".repeat(140)}…`);
  });
});
