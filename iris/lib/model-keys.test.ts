import { describe, expect, it } from "vitest";

import { isProvider, keyInUse, providerName, type ModelKey } from "./model-keys";

const key = (provider: ModelKey["provider"], hint: string, agentId: string | null = null): ModelKey => ({
  provider,
  scope: agentId ? "agent" : "organization",
  agentId,
  hint,
  updatedBy: "user-1",
  updatedAt: "2026-11-18T10:00:00.000Z",
});

describe("model keys", () => {
  const organization = [key("anthropic", "…org1")];

  it("uses the agent's own key first, then the organization's", () => {
    expect(keyInUse("anthropic", organization, [key("anthropic", "…own1", "agent-1")])).toEqual({
      source: "agent",
      hint: "…own1",
    });
    expect(keyInUse("anthropic", organization, [key("openai", "…oai1", "agent-1")])).toEqual({
      source: "organization",
      hint: "…org1",
    });
    expect(keyInUse("openai", organization, [])).toEqual({ source: "none", hint: null });
  });

  it("knows the providers keys can be set for", () => {
    expect(isProvider("openai")).toBe(true);
    expect(isProvider("acme")).toBe(false);
    expect(providerName("openai")).toBe("OpenAI");
    expect(providerName("acme")).toBe("acme");
  });
});
