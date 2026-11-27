import { describe, expect, it } from "vitest";

import {
  decisionsFor,
  matchedByLabel,
  newItemOf,
  pathsFromText,
  shortCommit,
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
    // A repository's documents change with commits.
    expect(decisionsFor("accepted", "repository")).toEqual([]);
    // Episteme's knowledge changes when a version is published there.
    expect(decisionsFor("accepted", "episteme")).toEqual([]);
  });

  it("says where an item came from and how it matched", () => {
    expect(
      sourceLabel({ source: { kind: "task", taskId: null }, createdBy: "sa-1" }),
    ).toBe("Proposed by an agent");
    expect(
      sourceLabel({
        source: { kind: "session", taskId: null, sessionId: "s-1", agentId: "a-1" },
        createdBy: "ada",
      }),
    ).toBe("Proposed in a council session");
    expect(
      sourceLabel({ source: { kind: "person", taskId: null }, createdBy: "ada" }),
    ).toBe("Written by ada");
    expect(
      sourceLabel({
        source: {
          kind: "repository",
          taskId: null,
          repository: {
            linkId: "link-1",
            fullName: "acme/api",
            path: "docs/a.md",
            commit: "abcdef1234",
            blobSha: "123",
            url: "https://github.com/acme/api/blob/abcdef1234/docs/a.md",
          },
        },
        createdBy: "repository:acme/api",
      }),
    ).toBe("From acme/api");
    expect(
      sourceLabel({
        source: {
          kind: "episteme",
          taskId: null,
          episteme: {
            resourceId: "r-1",
            versionId: "v-2",
            versionNumber: 2,
            knowledgeType: "standard_operating_procedure",
          },
        },
        createdBy: "episteme",
      }),
    ).toBe("Published in Episteme (standard operating procedure, version 2)");
    expect(shortCommit("abcdef1234567")).toBe("abcdef1");
    expect(shortCommit(null)).toBe("");
    expect(matchedByLabel(["keyword", "semantic"])).toBe("words and meaning");
    expect(matchedByLabel(["semantic"])).toBe("meaning");
  });

  it("names types and keeps documents out of what people write", () => {
    expect(typeLabel("architecture")).toBe("Architecture");
    expect(WRITABLE_TYPES.map((type) => type.value)).not.toContain("document");
    expect(tagsOf(undefined)).toEqual([]);
  });

  it("reads a repository's paths, one per line or comma-separated", () => {
    expect(pathsFromText("docs/\n README.md, adr/\n\ndocs/")).toEqual({
      paths: ["docs/", "README.md", "adr/"],
    });
    expect(pathsFromText(" ")).toMatchObject({
      error: expect.stringContaining("at least one"),
    });
    expect(pathsFromText("../secrets/")).toMatchObject({
      error: expect.stringContaining('not "../secrets/"'),
    });
    expect(pathsFromText("/etc/")).toMatchObject({ error: expect.any(String) });
    expect(pathsFromText("a/../b")).toMatchObject({ error: expect.any(String) });
    expect(
      pathsFromText(Array.from({ length: 21 }, (_, i) => `d${i}/`).join("\n")),
    ).toEqual({ error: "At most 20 paths." });
  });
});
