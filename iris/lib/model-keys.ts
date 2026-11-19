import type { ApiSchema } from "./api";

export type ModelKey = ApiSchema<"ModelKeyResponse">;
export type ModelProvider = ApiSchema<"ModelProvider">;

/** The providers keys can be set for (the gateway can call), with their names. */
export const PROVIDERS: { provider: ModelProvider; name: string }[] = [
  { provider: "anthropic", name: "Anthropic" },
  { provider: "openai", name: "OpenAI" },
  { provider: "google", name: "Google" },
  { provider: "mistral", name: "Mistral" },
];

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
): { source: "agent" | "organization" | "none"; hint: string | null } {
  const own = agentKeys.find((key) => key.provider === provider);
  if (own) return { source: "agent", hint: own.hint };
  const organization = organizationKeys.find((key) => key.provider === provider);
  if (organization) return { source: "organization", hint: organization.hint };
  return { source: "none", hint: null };
}
