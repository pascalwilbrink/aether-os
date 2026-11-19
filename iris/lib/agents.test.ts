import { describe, expect, it } from "vitest";

import type { Model } from "./api";
import { canPublish, fieldsOf, formatPrice, modelChoices, versionFromForm, versionStatusLabel } from "./agents";

const base = {
  instructions: " Fix bugs. ",
  model: "anthropic/claude-sonnet-5-5",
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
      "tool:docs": "on",
      "toolNames:docs": "lookup, search lookup",
      "tool:seshat": "on",
      "tool:off": "",
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
        tools: [
          { name: "docs", enabled: true, tools: ["lookup", "search"] },
          { name: "seshat", enabled: true },
        ],
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
    [{ ...base, model: "" }, "Choose a model."],
    [{ ...base, model: "claude-sonnet-5-5" }, "Choose a model."],
    [{ ...base, model: "anthropic/" }, "Choose a model."],
    [{ ...base, temperature: "3" }, "Temperature is a number from 0 to 2."],
    [{ ...base, temperature: "warm" }, "Temperature is a number from 0 to 2."],
    [{ ...base, maxTokens: "1.5" }, "Max tokens is a whole number above 0."],
    [{ ...base, maxTokens: "0" }, "Max tokens is a whole number above 0."],
    [{ ...base, "tool:docs": "on", "toolNames:docs": "a/b" }, '"a/b" isn\'t a tool name (letters, digits, _ . and -).'],
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
        model: "anthropic/m",
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
      tools: [{ name: "docs", enabled: true, tools: ["lookup"] }, { name: "seshat", enabled: true }],
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

    // A restricted network and its hosts round-trip too.
    const restricted = {
      ...version,
      runtime: {
        ...version.runtime,
        networkAccess: "restricted" as const,
        allowedHosts: ["api.example.com", "*.cdn.test"],
      },
    };
    expect(versionFromForm(fieldsOf(restricted as never))).toEqual({ body: restricted });
    expect(
      versionFromForm({ ...fieldsOf(restricted as never), allowedHosts: "API.example.com, ok.test\nnot a host" }),
    ).toEqual({ error: '"not" isn\'t a host name (e.g. api.example.com, or *.example.com).' });
  });
});

const model = (provider: string, id: string, name: string, input: string | null): Model => ({
  id: `${provider}-${id}`,
  provider,
  model: id,
  name,
  status: "active",
  contextWindow: null,
  maxOutputTokens: null,
  price: input
    ? {
        id: "price",
        modelId: `${provider}-${id}`,
        effectiveFrom: "2026-11-01T00:00:00.000Z",
        inputPerMTok: input,
        outputPerMTok: "10.000000",
        cacheReadPerMTok: null,
        cacheWritePerMTok: null,
        longContext: null,
        createdBy: "aether-os",
        createdAt: "2026-11-01T00:00:00.000Z",
      }
    : null,
  version: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
});

describe("modelChoices", () => {
  const models = [
    model("openai", "gpt-test", "GPT test", null),
    model("anthropic", "claude-sonnet-5-5", "Claude Sonnet 5.5", "2.000000"),
    model("anthropic", "claude-haiku-5-5", "Claude Haiku 5.5", "0.100000"),
  ];

  it("groups models by provider, with their prices", () => {
    expect(modelChoices(models, "anthropic/claude-sonnet-5-5")).toEqual({
      groups: [
        {
          provider: "anthropic",
          label: "Anthropic",
          options: [
            {
              value: "anthropic/claude-sonnet-5-5",
              label: "Claude Sonnet 5.5 · $2 / $10 per M tokens",
            },
            {
              value: "anthropic/claude-haiku-5-5",
              label: "Claude Haiku 5.5 · $0.1 / $10 per M tokens",
            },
          ],
        },
        {
          provider: "openai",
          label: "OpenAI",
          options: [{ value: "openai/gpt-test", label: "GPT test" }],
        },
      ],
      unavailable: null,
    });
  });

  it("says when the starting model can't be chosen any more", () => {
    expect(modelChoices(models, "anthropic/claude-opus-4-1").unavailable).toBe("anthropic/claude-opus-4-1");
    expect(modelChoices(models, "").unavailable).toBeNull();
    expect(modelChoices([], "").groups).toEqual([]);
  });

  it("writes prices as people read them", () => {
    expect(formatPrice("2.000000")).toBe("2");
    expect(formatPrice("0.125000")).toBe("0.125");
    expect(formatPrice("40")).toBe("40");
  });
});
