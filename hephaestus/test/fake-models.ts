import type { MastraModelConfig } from '@mastra/core/llm';

import { SecretStore } from '@hephaestus/core';
import { LanguageModels } from '@hephaestus/models';

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
  | {
      text: string;
      inputTokens?: number;
      outputTokens?: number;
      /** Of the input, read from the provider's prompt cache. */
      cachedInputTokens?: number;
    }
  /** Calls the first offered tool whose name contains `tool`. */
  | { toolCall: { tool: string; input: Record<string, unknown> } }
  | { error: { message: string; statusCode: number } };

interface CallOptions {
  prompt: { role: string; content: unknown }[];
  tools?: { name: string }[];
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
    if ('toolCall' in reply) {
      const tool = options.tools?.find((offered) =>
        offered.name.includes(reply.toolCall.tool),
      );
      if (!tool) {
        return Promise.reject(
          new Error(`No tool like ${reply.toolCall.tool} was offered`),
        );
      }
      return Promise.resolve({
        content: [
          {
            type: 'tool-call',
            toolCallId: `call-${this.calls.length}`,
            toolName: tool.name,
            input: JSON.stringify(reply.toolCall.input),
          },
        ],
        finishReason: 'tool-calls',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      });
    }
    const usage = {
      inputTokens: reply.inputTokens,
      outputTokens: reply.outputTokens,
      cachedInputTokens: reply.cachedInputTokens,
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
