import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { MastraModelConfig } from '@mastra/core/llm';

/**
 * Who a call through Pylon is for: the task token and the execution as a
 * label, or a session token (a session's calls have no execution).
 */
export interface PylonCall {
  token: string;
  executionId?: string;
}

/**
 * Models that call Pylon, never the provider (../docs/pylon.md): each
 * provider's own AI SDK client with its `baseURL` at Pylon's pass-through
 * (`/v1/providers/<provider>/…`) and the task token where the SDK puts its
 * key. Pylon picks the provider key, checks its
 * budgets and meters the call; Hephaestus never sees the key. Behind a port
 * so tests can point it anywhere.
 */
export abstract class PylonModels {
  abstract create(
    provider: string,
    modelId: string,
    call: PylonCall,
  ): MastraModelConfig;
}

export class HttpPylonModels extends PylonModels {
  constructor(private readonly url: string) {
    super();
  }

  create(
    provider: string,
    modelId: string,
    call: PylonCall,
  ): MastraModelConfig {
    const base = `${this.url.replace(/\/+$/, '')}/v1/providers/${provider}`;
    const settings = {
      apiKey: call.token,
      headers: call.executionId
        ? { 'x-aether-execution-id': call.executionId }
        : undefined,
    };
    switch (provider) {
      case 'anthropic':
        return createAnthropic({ ...settings, baseURL: `${base}/v1` })(modelId);
      case 'openai':
        return createOpenAI({ ...settings, baseURL: `${base}/v1` })(modelId);
      case 'google':
        return createGoogleGenerativeAI({
          ...settings,
          baseURL: `${base}/v1beta`,
        })(modelId);
      case 'mistral':
        return createMistral({ ...settings, baseURL: `${base}/v1` })(modelId);
      default:
        // Ollama, and anything else that speaks OpenAI's Chat Completions.
        return createOpenAICompatible({
          ...settings,
          name: provider,
          baseURL: `${base}/v1`,
          includeUsage: true,
        }).chatModel(modelId) as unknown as MastraModelConfig;
    }
  }
}
