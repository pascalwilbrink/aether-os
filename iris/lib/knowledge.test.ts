import { describe, expect, it } from "vitest";

import {
  decisionsFor,
  matchedByLabel,
  newItemOf,
  sourceLabel,
  tagsOf,
  typeLabel,
  WRITABLE_TYPES,
} from "./knowledge";

describe("knowledge", () => {
  it("builds a new item from its form, or says what's missing", () => {
    expect(
      newItemOf({
        type: "decision",
        title: " Use Postgres ",
        body: "One engine.",
        tags: "database, ops, database,",
      }),
    ).toEqual({
      request: {
        type: "decision",
        title: "Use Postgres",
        body: "One engine.",
        tags: ["database", "ops"],
      },
    });
    expect(newItemOf({ type: "document", title: "x", body: "y" })).toEqual({
      error: "Choose what kind of knowledge it is.",
    });
    expect(newItemOf({ type: "fact", title: "", body: "y" })).toEqual({
      error: "Give it a title.",
    });
    expect(newItemOf({ type: "fact", title: "x", body: " " })).toEqual({
      error: "Write what it says.",
    });
  });

  it("offers what the lifecycle allows", () => {
    expect(decisionsFor("proposed")).toEqual(["accept", "reject"]);
    expect(decisionsFor("accepted")).toEqual(["retire"]);
    expect(decisionsFor("superseded")).toEqual([]);
  });

  it("says where an item came from and how it matched", () => {
    expect(
      sourceLabel({ source: { kind: "task", taskId: null }, createdBy: "sa-1" }),
    ).toBe("Proposed by an agent");
    expect(
      sourceLabel({ source: { kind: "person", taskId: null }, createdBy: "ada" }),
    ).toBe("Written by ada");
    expect(matchedByLabel(["keyword", "semantic"])).toBe("words and meaning");
    expect(matchedByLabel(["semantic"])).toBe("meaning");
  });

  it("names types and keeps documents out of what people write", () => {
    expect(typeLabel("architecture")).toBe("Architecture");
    expect(WRITABLE_TYPES.map((type) => type.value)).not.toContain("document");
    expect(tagsOf(undefined)).toEqual([]);
  });
});
