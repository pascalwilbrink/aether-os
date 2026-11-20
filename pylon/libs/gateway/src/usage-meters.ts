import type { CallTokens } from '@pylon/catalog';

import type { ApiFormat } from './provider-apis.js';

/** What a call used and how it ended, as far as the provider said. */
export interface MeteredUsage {
  tokens: CallTokens;
  finishReason: string | null;
}

/**
 * Reads a call's usage from the provider's answer: a JSON body (`json`),
 * or each server-sent event's data of a stream (`event`). Providers report
 * usage differently; Pylon records input with cache reads and writes
 * included (docs/models.md, Metering).
 */
export interface UsageMeter {
  json(body: unknown): void;
  event(name: string | null, data: unknown): void;
  result(): MeteredUsage;
}

type Json = Record<string, unknown>;

const object = (value: unknown): Json | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : null;
const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;
const firstChoice = (body: Json | null): Json | null => {
  const choices = body?.choices;
  return Array.isArray(choices) ? object(choices[0]) : null;
};

/** The tokens so far, each field keeping the last value a provider gave. */
class Tally {
  input: number | null = null;
  output: number | null = null;
  cacheRead: number | null = null;
  cacheWrite: number | null = null;
  finishReason: string | null = null;

  set(fields: {
    input?: number | null;
    output?: number | null;
    cacheRead?: number | null;
    cacheWrite?: number | null;
  }): void {
    this.input = fields.input ?? this.input;
    this.output = fields.output ?? this.output;
    this.cacheRead = fields.cacheRead ?? this.cacheRead;
    this.cacheWrite = fields.cacheWrite ?? this.cacheWrite;
  }

  finish(reason: string | null): void {
    this.finishReason = reason ?? this.finishReason;
  }

  result(): MeteredUsage {
    return {
      tokens: {
        inputTokens: this.input,
        outputTokens: this.output,
        cacheReadTokens: this.cacheRead,
        cacheWriteTokens: this.cacheWrite,
      },
      finishReason: this.finishReason,
    };
  }
}

/**
 * Anthropic's Messages: `input_tokens` leaves out the cache, so input is
 * `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.
 * Streams start with `message_start` (input) and end with `message_delta`
 * (output so far, the stop reason).
 */
class AnthropicMeter implements UsageMeter {
  private readonly tally = new Tally();
  private uncached: number | null = null;

  json(body: unknown): void {
    const message = object(body);
    this.usage(object(message?.usage));
    this.tally.finish(text(message?.stop_reason));
  }

  event(_name: string | null, data: unknown): void {
    const event = object(data);
    if (event?.type === 'message_start') {
      this.usage(object(object(event.message)?.usage));
    } else if (event?.type === 'message_delta') {
      this.usage(object(event.usage));
      this.tally.finish(text(object(event.delta)?.stop_reason));
    }
  }

  result(): MeteredUsage {
    return this.tally.result();
  }

  private usage(usage: Json | null): void {
    if (!usage) return;
    this.uncached = count(usage.input_tokens) ?? this.uncached;
    this.tally.set({
      output: count(usage.output_tokens),
      cacheRead: count(usage.cache_read_input_tokens),
      cacheWrite: count(usage.cache_creation_input_tokens),
    });
    if (this.uncached !== null) {
      this.tally.input =
        this.uncached +
        (this.tally.cacheRead ?? 0) +
        (this.tally.cacheWrite ?? 0);
    }
  }
}

/**
 * OpenAI's Chat Completions (and Mistral's and Ollama's, which follow it):
 * `prompt_tokens` includes cached ones; a stream's last chunk has `usage`
 * (`stream_options.include_usage`).
 */
class OpenAiChatMeter implements UsageMeter {
  private readonly tally = new Tally();

  json(body: unknown): void {
    const completion = object(body);
    this.usage(object(completion?.usage));
    this.tally.finish(text(firstChoice(completion)?.finish_reason));
  }

  event(_name: string | null, data: unknown): void {
    this.json(data);
  }

  result(): MeteredUsage {
    return this.tally.result();
  }

  private usage(usage: Json | null): void {
    if (!usage) return;
    this.tally.set({
      input: count(usage.prompt_tokens),
      output: count(usage.completion_tokens),
      cacheRead: count(object(usage.prompt_tokens_details)?.cached_tokens),
    });
  }
}

/** OpenAI's Responses: `usage` on the response, or on `response.completed`'s. */
class OpenAiResponsesMeter implements UsageMeter {
  private readonly tally = new Tally();

  json(body: unknown): void {
    const response = object(body);
    const usage = object(response?.usage);
    if (usage) {
      this.tally.set({
        input: count(usage.input_tokens),
        output: count(usage.output_tokens),
        cacheRead: count(object(usage.input_tokens_details)?.cached_tokens),
      });
    }
    this.tally.finish(text(response?.status));
  }

  event(_name: string | null, data: unknown): void {
    const event = object(data);
    const type = text(event?.type);
    if (
      type === 'response.completed' ||
      type === 'response.incomplete' ||
      type === 'response.failed'
    ) {
      this.json(event?.response);
    }
  }

  result(): MeteredUsage {
    return this.tally.result();
  }
}

/**
 * Google's Gemini: `usageMetadata` (the prompt includes cached content;
 * output is the candidates and the model's thoughts), on the answer or on
 * each streamed chunk.
 */
class GoogleMeter implements UsageMeter {
  private readonly tally = new Tally();

  json(body: unknown): void {
    const answer = object(body);
    const usage = object(answer?.usageMetadata);
    if (usage) {
      const candidates = count(usage.candidatesTokenCount);
      const thoughts = count(usage.thoughtsTokenCount);
      this.tally.set({
        input: count(usage.promptTokenCount),
        output:
          candidates === null && thoughts === null
            ? null
            : (candidates ?? 0) + (thoughts ?? 0),
        cacheRead: count(usage.cachedContentTokenCount),
      });
    }
    const candidates = answer?.candidates;
    this.tally.finish(
      Array.isArray(candidates)
        ? text(object(candidates[0])?.finishReason)
        : null,
    );
  }

  event(_name: string | null, data: unknown): void {
    this.json(data);
  }

  result(): MeteredUsage {
    return this.tally.result();
  }
}

export function usageMeter(format: ApiFormat): UsageMeter {
  switch (format) {
    case 'anthropic-messages':
      return new AnthropicMeter();
    case 'openai-chat':
      return new OpenAiChatMeter();
    case 'openai-responses':
      return new OpenAiResponsesMeter();
    case 'google-generate':
      return new GoogleMeter();
  }
}
