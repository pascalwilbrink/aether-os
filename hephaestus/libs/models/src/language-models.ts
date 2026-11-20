import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { MastraModelConfig } from '@mastra/core/llm';

import { guardedFetch } from '@hephaestus/core';

import type { ModelKeySettings } from './model-key-settings.js';

/**
 * Builds the model Mastra calls, from a `provider/model` ID and the
 * settings the gateway picked (a key; for Ollama its server). Behind a port
 * so tests use a scripted model.
 */
export abstract class LanguageModels {
  abstract create(
    id: `${string}/${string}`,
    settings: ModelKeySettings,
  ): MastraModelConfig;
}

export interface MastraModelRouterOptions {
  /** `MODEL_ENDPOINT_ALLOW_PRIVATE`: for Ollama servers. */
  allowPrivate: boolean;
}

/**
 * Mastra's model router for the hosted providers, with the key passed in
 * (never from env variables). Ollama through its OpenAI-compatible API
 * (`<baseUrl>/v1`), with `guardedFetch`: the server is the organization's
 * URL, so a name can't lead Hephaestus to private addresses (unless
 * allowed) and redirects are refused.
 */
export class MastraModelRouter extends LanguageModels {
  constructor(private readonly options: MastraModelRouterOptions) {
    super();
  }

  create(
    id: `${string}/${string}`,
    settings: ModelKeySettings,
  ): MastraModelConfig {
    const slash = id.indexOf('/');
    const provider = id.slice(0, slash);
    const modelId = id.slice(slash + 1);
    if (provider === 'ollama' && settings.baseUrl) {
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: `${settings.baseUrl}/v1`,
        ...(settings.apiKey ? { apiKey: settings.apiKey } : {}),
        fetch: guardedFetch(this.options.allowPrivate),
        includeUsage: true,
      }).chatModel(modelId) as unknown as MastraModelConfig;
    }
    return { id, apiKey: settings.apiKey };
  }
}
