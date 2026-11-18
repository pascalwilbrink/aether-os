import { describe, expect, it } from "vitest";

import { canPublish, fieldsOf, versionFromForm, versionStatusLabel } from "./agents";

const base = {
  instructions: " Fix bugs. ",
  provider: "Anthropic",
  model: "claude-sonnet-5-5",
};

describe("versionFromForm", () => {
  it("builds the request from the form, with defaults", () => {
    expect(versionFromForm(base)).toEqual({
      body: {
        instructions: "Fix bugs.",
        model: { provider: "anthropic", model: "claude-sonnet-5-5" },
        capabilities: [],
        tools: [],
        skills: [],
        runtime: {
          provider: "mastra",
          executionMode: "standard",
          sandboxRequired: false,
        },
      },
    });
  });

  it("reads the optional settings", () => {
    const result = versionFromForm({
      ...base,
      temperature: "0.3",
      maxTokens: "2000",
      capabilities: "code, chat,code,",
      executionMode: "coding",
      sandboxRequired: "on",
      runtimeProvider: "local",
      tools: '[{"name":"github","enabled":false}]',
      skills: "[]",
    });
    expect(result).toEqual({
      body: {
        instructions: "Fix bugs.",
        model: {
          provider: "anthropic",
          model: "claude-sonnet-5-5",
          temperature: 0.3,
          maxTokens: 2000,
        },
        capabilities: ["code", "chat"],
        tools: [{ name: "github", enabled: false }],
        skills: [],
        runtime: {
          provider: "local",
          executionMode: "coding",
          sandboxRequired: true,
        },
      },
    });
  });

  it.each([
    [{ ...base, instructions: " " }, "Write the agent's instructions."],
    [{ ...base, model: "" }, "Choose a model provider and a model."],
    [{ ...base, temperature: "3" }, "Temperature is a number from 0 to 2."],
    [{ ...base, temperature: "warm" }, "Temperature is a number from 0 to 2."],
    [{ ...base, maxTokens: "1.5" }, "Max tokens is a whole number above 0."],
    [{ ...base, maxTokens: "0" }, "Max tokens is a whole number above 0."],
    [{ ...base, tools: "{" }, "The carried-over tools aren't valid."],
    [{ ...base, skills: "{}" }, "The carried-over skills aren't valid."],
  ])("refuses %o", (fields, error) => {
    expect(versionFromForm(fields)).toEqual({ error });
  });
});

describe("versions", () => {
  it("publishes only drafts", () => {
    expect(canPublish({ status: "draft" })).toBe(true);
    expect(canPublish({ status: "published" })).toBe(false);
    expect(canPublish({ status: "deprecated" })).toBe(false);
    expect(versionStatusLabel("deprecated")).toBe("Deprecated");
  });
});

describe("fieldsOf", () => {
  it("gives a first version's defaults", () => {
    expect(
      versionFromForm({
        ...fieldsOf(undefined),
        instructions: "Hi.",
        model: "m",
      }),
    ).toEqual({
      body: expect.objectContaining({
        model: { provider: "anthropic", model: "m" },
        runtime: {
          provider: "mastra",
          executionMode: "standard",
          sandboxRequired: false,
        },
      }),
    });
  });

  it("round-trips a version through the form", () => {
    const version = {
      instructions: "Fix bugs.",
      model: {
        provider: "openai",
        model: "gpt",
        temperature: 0.5,
        maxTokens: 100,
      },
      capabilities: ["code", "chat"],
      tools: [{ name: "github", enabled: false }],
      skills: [],
      runtime: {
        provider: "local",
        executionMode: "coding" as const,
        sandboxRequired: true,
      },
    };
    expect(versionFromForm(fieldsOf(version as never))).toEqual({
      body: version,
    });
  });
});
