import { describe, expect, it } from "vitest";

import {
  isProvider,
  keyFromForm,
  keyInUse,
  providerName,
  type ModelKey,
} from "./model-keys";

const key = (
  provider: ModelKey["provider"],
  hint: string,
  agentId: string | null = null,
): ModelKey => ({
  provider,
  scope: agentId ? "agent" : "organization",
  agentId,
  hint,
  baseUrl: null,
  updatedBy: "user-1",
  updatedAt: "2026-11-18T10:00:00.000Z",
});

describe("model keys", () => {
  const organization = [key("anthropic", "…org1")];

  it("uses the agent's own key first, then the organization's", () => {
    expect(
      keyInUse("anthropic", organization, [
        key("anthropic", "…own1", "agent-1"),
      ]),
    ).toEqual({
      source: "agent",
      hint: "…own1",
      baseUrl: null,
    });
    expect(
      keyInUse("anthropic", organization, [key("openai", "…oai1", "agent-1")]),
    ).toEqual({
      source: "organization",
      hint: "…org1",
      baseUrl: null,
    });
    expect(keyInUse("openai", organization, [])).toEqual({
      source: "none",
      hint: null,
      baseUrl: null,
    });
  });

  it("knows the providers keys can be set for", () => {
    expect(isProvider("openai")).toBe(true);
    expect(isProvider("acme")).toBe(false);
    expect(providerName("openai")).toBe("OpenAI");
    expect(providerName("acme")).toBe("acme");
  });

  it("reads a key, or an Ollama server, from its form", () => {
    expect(keyFromForm("openai", { apiKey: " sk-proj-12345678 " })).toEqual({
      body: { apiKey: "sk-proj-12345678" },
    });
    expect(keyFromForm("openai", { apiKey: "short" })).toEqual({
      error: "Paste the whole API key.",
    });
    expect(
      keyFromForm("ollama", {
        baseUrl: "https://ollama.example.com/",
        apiKey: "",
      }),
    ).toEqual({
      body: { baseUrl: "https://ollama.example.com" },
    });
    expect(
      keyFromForm("ollama", {
        baseUrl: "http://localhost:11434",
        apiKey: "ollama-key-1",
      }),
    ).toEqual({
      body: { baseUrl: "http://localhost:11434", apiKey: "ollama-key-1" },
    });
    expect(keyFromForm("ollama", { baseUrl: "ollama.local" })).toMatchObject({
      error: expect.stringContaining("https://"),
    });
  });
});
