import { describe, expect, it } from "vitest";

import {
  criteriaFromJson,
  fieldsFromContent,
  inputsFromText,
  templateContentFromForm,
  textFromInputs,
  type TemplateContent,
} from "./templates";

describe("inputsFromText", () => {
  it("reads names, what they are, and optional ones", () => {
    expect(
      inputsFromText("issue: The issue\n\nnotes?: Anything else\nrepo"),
    ).toEqual({
      inputs: [
        { name: "issue", description: "The issue" },
        { name: "notes", description: "Anything else", required: false },
        { name: "repo" },
      ],
    });
  });

  it("refuses bad or repeated names, and reads back what it wrote", () => {
    expect(inputsFromText("issue.title: x")).toMatchObject({
      error: expect.stringContaining('not "issue.title"'),
    });
    expect(inputsFromText("a\na")).toEqual({
      error: "The input a is listed twice.",
    });
    const inputs = [
      { name: "issue", description: "The issue" },
      { name: "notes", required: false },
    ];
    expect(inputsFromText(textFromInputs(inputs))).toEqual({ inputs });
  });
});

describe("criteriaFromJson", () => {
  it("keeps command and manual checks, leaving empty rows out", () => {
    expect(
      criteriaFromJson(
        JSON.stringify([
          {
            key: "tests",
            description: "Tests pass",
            type: "command",
            command: "pnpm test",
          },
          { key: "", description: "", type: "manual", command: "" },
          {
            key: "reads-well",
            description: "Reads well",
            type: "manual",
            command: "",
          },
        ]),
      ),
    ).toEqual({
      criteria: [
        {
          key: "tests",
          description: "Tests pass",
          check: { type: "command", command: "pnpm test" },
        },
        {
          key: "reads-well",
          description: "Reads well",
          check: { type: "manual" },
        },
      ],
    });
  });

  it.each([
    [[{ key: "a b", description: "x", type: "manual" }], "A criterion's key"],
    [
      [{ key: "a", description: "", type: "manual" }],
      "Describe the criterion a.",
    ],
    [
      [{ key: "a", description: "x", type: "command", command: "" }],
      "Give the command",
    ],
    [
      [
        { key: "a", description: "x", type: "manual" },
        { key: "a", description: "y", type: "manual" },
      ],
      "listed twice",
    ],
  ])("refuses %j", (rows, error) => {
    const result = criteriaFromJson(JSON.stringify(rows));
    expect("error" in result && result.error).toContain(error);
  });
});

describe("templateContentFromForm", () => {
  const filled = {
    title: "Fix {{issue}}",
    instructions: "Fix the bug in {{issue}}.",
    agentId: "agent-1",
    expectedOutcome: "The bug is gone.",
    requirements: "Fix {{issue}}",
    constraints: "No new dependencies",
    deliverables: JSON.stringify([
      {
        key: "pr",
        kind: "pull_request",
        description: "The fix",
        primary: true,
      },
    ]),
    inputs: "issue: The issue",
    criteria: JSON.stringify([
      {
        key: "tests",
        description: "Tests pass",
        type: "command",
        command: "pnpm test",
      },
    ]),
    context: "item-1,item-2",
    review: "all",
  };

  it("builds a whole version's content", () => {
    expect(templateContentFromForm(filled)).toEqual({
      content: {
        title: "Fix {{issue}}",
        instructions: "Fix the bug in {{issue}}.",
        agentId: "agent-1",
        expectedOutcome: "The bug is gone.",
        requirements: [{ key: "REQ-1", description: "Fix {{issue}}" }],
        constraints: [{ key: "CON-1", description: "No new dependencies" }],
        deliverables: [
          {
            key: "pr",
            kind: "pull_request",
            description: "The fix",
            primary: true,
          },
        ],
        inputs: [{ name: "issue", description: "The issue" }],
        acceptanceCriteria: [
          {
            key: "tests",
            description: "Tests pass",
            check: { type: "command", command: "pnpm test" },
          },
        ],
        context: [
          { kind: "knowledge", itemId: "item-1" },
          { kind: "knowledge", itemId: "item-2" },
        ],
        review: { artifactKinds: ["*"] },
      },
    });
  });

  it("needs a title, instructions and an agent unless it extends a template", () => {
    expect(templateContentFromForm({ title: "x" })).toMatchObject({
      error: expect.stringContaining("needs a title, what to do and an agent"),
    });
    expect(
      templateContentFromForm({
        extendsTemplateId: "org-template",
        extendsVersion: "2",
        constraints: "Mind the billing code",
      }),
    ).toEqual({
      content: {
        constraints: [{ key: "CON-1", description: "Mind the billing code" }],
        review: { artifactKinds: [] },
        extends: { templateId: "org-template", version: 2 },
      },
    });
    expect(
      templateContentFromForm({
        extendsTemplateId: "org-template",
        extendsVersion: "",
      }),
    ).toEqual({ error: "Choose which version of the template it extends." });
  });

  it("starts the next version from the latest one's content", () => {
    const { content } = templateContentFromForm(filled) as {
      content: TemplateContent;
    };
    expect(templateContentFromForm(fieldsFromContent(content))).toEqual({
      content,
    });
  });
});
