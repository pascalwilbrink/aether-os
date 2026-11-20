import { endpointProblem } from '@hephaestus/core';

/** Providers whose models aren't in the catalogue: servers organizations run. */
export const SELF_HOSTED_PROVIDERS: readonly string[] = ['ollama'];

export const isSelfHosted = (provider: string) =>
  SELF_HOSTED_PROVIDERS.includes(provider);

/** What's stored in OpenBao for a provider (docs/models.md, Keys). */
export interface ModelKeySettings {
  apiKey?: string;
  /** Ollama: its server, without a trailing slash. */
  baseUrl?: string;
}

/**
 * The settings to store for a provider, or why they can't be: the hosted
 * providers take an API key and nothing else; Ollama a `baseUrl` Hephaestus
 * will call (`endpointProblem`) and maybe a key.
 */
export function checkModelKeySettings(
  provider: string,
  input: { apiKey?: string; baseUrl?: string },
  { allowPrivate }: { allowPrivate: boolean },
): ModelKeySettings | { problem: string } {
  const apiKey = input.apiKey?.trim() || undefined;
  if (!isSelfHosted(provider)) {
    if (input.baseUrl !== undefined) {
      return { problem: `A ${provider} key has no base URL.` };
    }
    if (!apiKey) {
      return { problem: `A ${provider} key needs its apiKey.` };
    }
    return { apiKey };
  }
  const baseUrl = input.baseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl) {
    return {
      problem: `An ${provider} server needs its baseUrl (e.g. https://ollama.example.com).`,
    };
  }
  const problem = endpointProblem(baseUrl, { allowPrivate });
  if (problem) {
    return { problem: `${baseUrl}: ${problem}` };
  }
  return apiKey ? { apiKey, baseUrl } : { baseUrl };
}
