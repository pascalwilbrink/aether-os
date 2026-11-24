import type { MastraModelConfig } from '@mastra/core/llm';

import { SecretStore, type ApiTypes } from '@hephaestus/core';
import {
  Pylon,
  PylonModels,
  type BudgetScope,
  type PylonCall,
  type TaskBudgets,
} from '@hephaestus/models';

/** Secrets in memory, by path. */
export class FakeSecretStore extends SecretStore {
  readonly secrets = new Map<string, Record<string, unknown>>();
  readonly reads: string[] = [];

  read(path: string): Promise<Record<string, unknown> | null> {
    this.reads.push(path);
    return Promise.resolve(this.secrets.get(path) ?? null);
  }

  write(path: string, data: Record<string, unknown>): Promise<void> {
    this.secrets.set(path, data);
    return Promise.resolve();
  }

  delete(path: string): Promise<void> {
    this.secrets.delete(path);
    return Promise.resolve();
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
  | { error: { message: string; statusCode: number; responseBody?: string } };

interface CallOptions {
  prompt: { role: string; content: unknown }[];
  tools?: { name: string }[];
  temperature?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
}

/**
 * Models that answer from a script instead of through Pylon (an AI SDK v2
 * model, as the provider's own client would be): records which model was
 * asked for, with which token and execution, what each call was given, and
 * the usage Pylon would have metered per execution.
 */
export class ScriptedPylonModels extends PylonModels {
  readonly created: ({ id: string } & PylonCall)[] = [];
  readonly calls: CallOptions[] = [];
  /** Calls, tokens per execution, as Pylon's usage would total them. */
  readonly usage = new Map<string, ApiTypes.ExecutionUsage>();
  replies: ScriptedReply[] = [];

  create(
    provider: string,
    modelId: string,
    call: PylonCall,
  ): MastraModelConfig {
    this.created.push({ id: `${provider}/${modelId}`, ...call });
    const model = {
      specificationVersion: 'v2',
      provider,
      modelId,
      supportedUrls: {},
      doGenerate: async (options: CallOptions) => {
        const reply = await this.reply(options);
        this.meter(call.executionId ?? `session:${call.token}`, reply.usage);
        return reply;
      },
      // The same script as a stream (sessions): the reply's parts, the text
      // in two deltas.
      doStream: async (options: CallOptions) => {
        const reply = await this.reply(options);
        this.meter(call.executionId ?? `session:${call.token}`, reply.usage);
        return {
          stream: (
            ReadableStream as unknown as {
              from(parts: unknown[]): ReadableStream;
            }
          ).from(streamParts(reply as Parameters<typeof streamParts>[0])),
        };
      },
    };
    return model as unknown as MastraModelConfig;
  }

  private meter(
    executionId: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      cachedInputTokens?: number;
    },
  ): void {
    const totals = this.usage.get(executionId) ?? {
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: null,
    };
    this.usage.set(executionId, {
      ...totals,
      modelCalls: totals.modelCalls + 1,
      inputTokens: totals.inputTokens + (usage.inputTokens ?? 0),
      outputTokens: totals.outputTokens + (usage.outputTokens ?? 0),
      cacheReadTokens: totals.cacheReadTokens + (usage.cachedInputTokens ?? 0),
    });
  }

  private reply(options: CallOptions) {
    // As a provider's fetch would: an aborted call never reaches it.
    if (options.abortSignal?.aborted) {
      return Promise.reject(
        options.abortSignal.reason instanceof Error
          ? options.abortSignal.reason
          : new DOMException('The call was aborted', 'AbortError'),
      );
    }
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
          responseBody: reply.error.responseBody,
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

/** A generated reply as the parts of an AI SDK v2 stream. */
function streamParts(reply: {
  content: (
    | { type: 'text'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: string }
  )[];
  finishReason: string;
  usage: unknown;
}): unknown[] {
  const parts: unknown[] = [{ type: 'stream-start', warnings: [] }];
  reply.content.forEach((part, index) => {
    if (part.type === 'text') {
      const id = `text-${index}`;
      const half = Math.ceil(part.text.length / 2);
      parts.push(
        { type: 'text-start', id },
        { type: 'text-delta', id, delta: part.text.slice(0, half) },
        { type: 'text-delta', id, delta: part.text.slice(half) },
        { type: 'text-end', id },
      );
    } else {
      parts.push(part);
    }
  });
  parts.push({
    type: 'finish',
    finishReason: reply.finishReason,
    usage: reply.usage,
  });
  return parts;
}

/** A budget Pylon would answer with `402 BUDGET_EXHAUSTED`. */
export function budgetExhausted(
  scope: BudgetScope,
  scopeId: string,
): ScriptedReply {
  return {
    error: {
      message: 'Payment Required',
      statusCode: 402,
      responseBody: JSON.stringify({
        type: 'about:blank',
        status: 402,
        code: 'BUDGET_EXHAUSTED',
        title: 'Payment Required',
        detail: `The ${scope} budget ran out.`,
        budget: { scope, scopeId },
      }),
    },
  };
}

/**
 * Pylon's budget checks, task trees' budgets and usage, in memory:
 * `exhaustedScope` is what the budget check answers (null: room), tree
 * budgets are kept as set, and usage comes from the scripted models'
 * calls.
 */
export class FakePylon extends Pylon {
  exhaustedScope: { scope: BudgetScope; scopeId: string } | null = null;
  readonly checks: TaskBudgets[] = [];
  readonly treeBudgets = new Map<
    string,
    { limitUsd: string | null; token: string }
  >();

  constructor(private readonly models?: ScriptedPylonModels) {
    super();
  }

  exhausted(task: TaskBudgets) {
    this.checks.push(task);
    return Promise.resolve(this.exhaustedScope);
  }

  taskTreeBudget(
    _organizationId: string,
    _projectId: string,
    taskTreeId: string,
  ): Promise<ApiTypes.BudgetResponse> {
    return Promise.resolve(this.response(taskTreeId));
  }

  setTaskTreeBudget(
    _organizationId: string,
    _projectId: string,
    taskTreeId: string,
    limitUsd: string | null,
    callerToken: string,
  ): Promise<ApiTypes.BudgetResponse> {
    this.treeBudgets.set(taskTreeId, { limitUsd, token: callerToken });
    return Promise.resolve(this.response(taskTreeId));
  }

  usageOf(
    _organizationId: string,
    executionIds: string[],
  ): Promise<Map<string, ApiTypes.ExecutionUsage>> {
    const usage = new Map<string, ApiTypes.ExecutionUsage>();
    for (const id of executionIds) {
      const totals = this.models?.usage.get(id);
      if (totals) usage.set(id, totals);
    }
    return Promise.resolve(usage);
  }

  private response(taskTreeId: string): ApiTypes.BudgetResponse {
    const limitUsd = this.treeBudgets.get(taskTreeId)?.limitUsd ?? null;
    return {
      scope: 'task_tree',
      scopeId: taskTreeId,
      limitUsd: limitUsd === null ? null : Number(limitUsd).toFixed(6),
      spentUsd: '0.000000',
      windowStart: null,
      thresholdPercent: 80,
      updatedAt: limitUsd === null ? null : new Date().toISOString(),
    };
  }
}
