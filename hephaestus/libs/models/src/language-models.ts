import type { MastraModelConfig } from '@mastra/core/llm';

/**
 * Builds the model Mastra calls, from a `provider/model` ID and the key the
 * gateway picked. Behind a port so tests use a scripted model.
 */
export abstract class LanguageModels {
  abstract create(id: `${string}/${string}`, apiKey: string): MastraModelConfig;
}

/** Mastra's model router, with the key passed in (never from env variables). */
export class MastraModelRouter extends LanguageModels {
  create(id: `${string}/${string}`, apiKey: string): MastraModelConfig {
    return { id, apiKey };
  }
}
