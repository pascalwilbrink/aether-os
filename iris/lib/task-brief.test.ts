import { describe, expect, it } from "vitest";

import {
  briefFromForm,
  deliverablesFromJson,
  itemsFromText,
  textFromItems,
} from "./task-brief";

describe("itemsFromText", () => {
  it("keeps typed keys and numbers the rest, skipping what's taken", () => {
    expect(
      itemsFromText(
        "- Expose GET /v1/invoices\n\nREQ-1: Paginate them\n* Sort newest first",
        "REQ",
      ),
    ).toEqual({
      items: [
        { key: "REQ-2", description: "Expose GET /v1/invoices" },
        { key: "REQ-1", description: "Paginate them" },
        { key: "REQ-3", description: "Sort newest first" },
      ],
    });
    expect(
      itemsFromText("No new dependencies", "CON", new Set(["CON-1"])),
    ).toEqual({
      items: [{ key: "CON-2", description: "No new dependencies" }],
    });
  });

  it("refuses a key twice and too many lines", () => {
    expect(itemsFromText("A: one\nA: two", "REQ")).toEqual({
      error: "The key A is used twice.",
    });
    expect(
      itemsFromText(
        Array.from({ length: 51 }, (_, i) => `x${i}`).join("\n"),
        "REQ",
      ),
    ).toEqual({ error: "At most 50 lines." });
  });

  it("reads back what it wrote", () => {
    const items = [{ key: "REQ-1", description: "Do it" }];
    expect(itemsFromText(textFromItems(items), "REQ")).toEqual({ items });
  });
});

describe("deliverablesFromJson", () => {
  it("keeps filled rows, and a path only on a file", () => {
    expect(
      deliverablesFromJson(
        JSON.stringify([
          {
            key: "pr",
            kind: "pull_request",
            description: "The fix",
            primary: true,
          },
          { key: "", description: "" },
          {
            key: "notes",
            kind: "file",
            description: "Notes",
            path: "notes-*.md",
          },
        ]),
      ),
    ).toEqual({
      deliverables: [
        {
          key: "pr",
          kind: "pull_request",
          description: "The fix",
          primary: true,
        },
        {
          key: "notes",
          kind: "file",
          description: "Notes",
          path: "notes-*.md",
        },
      ],
    });
  });

  it.each([
    [[{ key: "a b", kind: "text", description: "x" }], "letters, digits"],
    [
      [{ key: "a", kind: "text", description: "" }],
      "Describe the deliverable a.",
    ],
    [[{ key: "a", kind: "sheet", description: "x" }], "Choose what kind"],
    [
      [{ key: "a", kind: "text", description: "x", path: "a.md" }],
      "Only a file",
    ],
    [
      [
        { key: "a", kind: "text", description: "x" },
        { key: "a", kind: "json", description: "y" },
      ],
      "listed twice",
    ],
    [
      [
        { key: "a", kind: "text", description: "x", primary: true },
        { key: "b", kind: "text", description: "y", primary: true },
      ],
      "At most one",
    ],
  ])("refuses %j", (rows, error) => {
    const result = deliverablesFromJson(JSON.stringify(rows));
    expect("error" in result && result.error).toContain(error);
  });
});

describe("briefFromForm", () => {
  it("needs a description, and leaves out what's empty", () => {
    expect(briefFromForm({ description: " " })).toEqual({
      error: "Describe the task: what needs to be done, and why.",
    });
    expect(
      briefFromForm({
        description: "Customers need invoices.",
        expectedOutcome: " ",
        requirements: "Expose GET /v1/invoices",
        constraints: "No new dependencies",
        deliverables: "[]",
      }),
    ).toEqual({
      brief: {
        description: "Customers need invoices.",
        requirements: [
          { key: "REQ-1", description: "Expose GET /v1/invoices" },
        ],
        constraints: [{ key: "CON-1", description: "No new dependencies" }],
      },
    });
  });

  it("keeps requirement and constraint keys apart", () => {
    const result = briefFromForm({
      description: "x",
      requirements: "A: one",
      constraints: "A: two",
    });
    expect(result).toEqual({ error: "Constraints: The key A is used twice." });
  });
});
