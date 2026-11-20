import type { PylonSchema } from "./api";

export type ModelKey = PylonSchema<"ModelKeyResponse">;
export type ModelProvider = PylonSchema<"ModelProvider">;

/** The providers keys can be set for (the gateway can call), with their names. */
export const PROVIDERS: { provider: ModelProvider; name: string }[] = [
  { provider: "anthropic", name: "Anthropic" },
  { provider: "openai", name: "OpenAI" },
  { provider: "google", name: "Google" },
  { provider: "mistral", name: "Mistral" },
  { provider: "ollama", name: "Ollama" },
];

/** Providers that are a server the organization runs: a base URL and an optional key. */
export const isSelfHosted = (provider: string) => provider === "ollama";

/**
 * A key's request from its form, or what's wrong: an API key for the
 * hosted providers; for Ollama its server's base URL and maybe a key.
 */
export function keyFromForm(
  provider: string,
  fields: { apiKey?: string; baseUrl?: string },
): { body: { apiKey?: string; baseUrl?: string } } | { error: string } {
  const apiKey = (fields.apiKey ?? "").trim();
  if (!isSelfHosted(provider)) {
    return apiKey.length < 8
      ? { error: "Paste the whole API key." }
      : { body: { apiKey } };
  }
  const baseUrl = (fields.baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/./.test(baseUrl)) {
    return {
      error:
        "The server's URL starts with https:// (e.g. https://ollama.example.com).",
    };
  }
  if (apiKey && apiKey.length < 8) {
    return { error: "Paste the whole API key, or leave it empty." };
  }
  return { body: apiKey ? { baseUrl, apiKey } : { baseUrl } };
}

export const isProvider = (value: unknown): value is ModelProvider =>
  PROVIDERS.some(({ provider }) => provider === value);

export const providerName = (provider: string) =>
  PROVIDERS.find((entry) => entry.provider === provider)?.name ?? provider;

/**
 * Which key an agent's calls to a provider use (docs/models.md, Keys): its
 * own, else the organization's; none means its tasks fail (or use the
 * platform's, if the organization's plan allows).
 */
export function keyInUse(
  provider: string,
  organizationKeys: ModelKey[],
  agentKeys: ModelKey[],
): {
  source: "agent" | "organization" | "none";
  hint: string | null;
  baseUrl: string | null;
} {
  const own = agentKeys.find((key) => key.provider === provider);
  if (own) return { source: "agent", hint: own.hint, baseUrl: own.baseUrl };
  const organization = organizationKeys.find(
    (key) => key.provider === provider,
  );
  if (organization)
    return {
      source: "organization",
      hint: organization.hint,
      baseUrl: organization.baseUrl,
    };
  return { source: "none", hint: null, baseUrl: null };
}
