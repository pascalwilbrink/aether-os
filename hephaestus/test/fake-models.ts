import type { MastraModelConfig } from '@mastra/core/llm';

import { LanguageModels, SecretStore } from '@hephaestus/models';

/** Secrets in memory, by path. */
export class FakeSecretStore extends SecretStore {
  readonly secrets = new Map<string, Record<string, unknown>>();
  readonly reads: string[] = [];

  read(path: string): Promise<Record<string, unknown> | null> {
    this.reads.push(path);
    return Promise.resolve(this.secrets.get(path) ?? null);
  }
}

/** What a scripted model call returns, or the provider error it throws. */
export type ScriptedReply =
  | { text: string; inputTokens?: number; outputTokens?: number }
  | { error: { message: string; statusCode: number } };

interface CallOptions {
  prompt: { role: string; content: unknown }[];
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Language models that answer from a script instead of a provider (an AI
 * SDK v2 model, as Mastra's router would build): records which model and
 * key the gateway asked for, and what each call was given.
 */
export class ScriptedLanguageModels extends LanguageModels {
  readonly created: { id: string; apiKey: string }[] = [];
  readonly calls: CallOptions[] = [];
  replies: ScriptedReply[] = [];

  create(id: `${string}/${string}`, apiKey: string): MastraModelConfig {
    this.created.push({ id, apiKey });
    const [provider, modelId] = id.split('/');
    const model = {
      specificationVersion: 'v2',
      provider,
      modelId,
      supportedUrls: {},
      doGenerate: (options: CallOptions) => this.reply(options),
      doStream: () => Promise.reject(new Error('not scripted')),
    };
    return model as unknown as MastraModelConfig;
  }

  private reply(options: CallOptions) {
    this.calls.push(options);
    const reply = this.replies.shift() ?? { text: 'Done.' };
    if ('error' in reply) {
      return Promise.reject(
        Object.assign(new Error(reply.error.message), {
          name: 'AI_APICallError',
          // How the AI SDK (and Mastra) recognise an APICallError.
          [Symbol.for('vercel.ai.error')]: true,
          [Symbol.for('vercel.ai.error.AI_APICallError')]: true,
          statusCode: reply.error.statusCode,
          // Not retried within the call, so tests don't wait for backoff.
          isRetryable: false,
        }),
      );
    }
    const usage = {
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      totalTokens:
        reply.inputTokens !== undefined && reply.outputTokens !== undefined
          ? reply.inputTokens + reply.outputTokens
          : undefined,
    };
    return Promise.resolve({
      content: [{ type: 'text', text: reply.text }],
      finishReason: 'stop',
      usage,
      warnings: [],
      response: {
        id: 'response-1',
        modelId: 'scripted',
        timestamp: new Date(),
      },
    });
  }
}
