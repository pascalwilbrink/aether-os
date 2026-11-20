import { usageMeter } from './usage-meters.js';

describe('usage meters', () => {
  it("counts Anthropic's cache in the input, from a body or a stream", () => {
    const body = usageMeter('anthropic-messages');
    body.json({
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 5,
        output_tokens: 7,
      },
    });
    expect(body.result()).toEqual({
      tokens: {
        inputTokens: 17,
        outputTokens: 7,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
      },
      finishReason: 'end_turn',
    });

    const stream = usageMeter('anthropic-messages');
    stream.event('message_start', {
      type: 'message_start',
      message: { usage: { input_tokens: 10, output_tokens: 1 } },
    });
    stream.event('ping', { type: 'ping' });
    stream.event('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'max_tokens' },
      usage: { output_tokens: 40 },
    });
    expect(stream.result()).toEqual({
      tokens: {
        inputTokens: 10,
        outputTokens: 40,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      },
      finishReason: 'max_tokens',
    });
  });

  it("reads OpenAI's Chat Completions and Responses", () => {
    const chat = usageMeter('openai-chat');
    chat.event(null, { choices: [{ delta: {}, finish_reason: 'stop' }] });
    chat.event(null, {
      choices: [],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 4,
        prompt_tokens_details: { cached_tokens: 8 },
      },
    });
    expect(chat.result()).toEqual({
      tokens: {
        inputTokens: 20,
        outputTokens: 4,
        cacheReadTokens: 8,
        cacheWriteTokens: null,
      },
      finishReason: 'stop',
    });

    const responses = usageMeter('openai-responses');
    responses.event('response.output_text.delta', {
      type: 'response.output_text.delta',
    });
    responses.event('response.completed', {
      type: 'response.completed',
      response: {
        status: 'completed',
        usage: { input_tokens: 30, output_tokens: 6 },
      },
    });
    expect(responses.result().tokens).toMatchObject({
      inputTokens: 30,
      outputTokens: 6,
    });
  });

  it("counts Gemini's thoughts as output, keeping the last chunk's usage", () => {
    const meter = usageMeter('google-generate');
    meter.event(null, {
      usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 2 },
    });
    meter.event(null, {
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: 12,
        candidatesTokenCount: 5,
        thoughtsTokenCount: 3,
        cachedContentTokenCount: 4,
      },
    });
    expect(meter.result()).toEqual({
      tokens: {
        inputTokens: 12,
        outputTokens: 8,
        cacheReadTokens: 4,
        cacheWriteTokens: null,
      },
      finishReason: 'STOP',
    });
  });

  it('records nothing it was not told', () => {
    const meter = usageMeter('openai-chat');
    meter.json('not an object');
    meter.event(null, { usage: { prompt_tokens: -1 } });
    expect(meter.result().tokens).toEqual({
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
    });
  });
});
