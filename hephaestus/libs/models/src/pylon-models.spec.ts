import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { HttpPylonModels } from './pylon-models.js';

/** The answer each provider's API gives, as Pylon passes it through. */
function answerFor(path: string): unknown {
  if (path.endsWith('/v1/messages')) {
    return {
      id: 'msg_1',
      type: 'message',
      role: 'assistant',
      model: 'claude',
      content: [{ type: 'text', text: 'Hi from Anthropic' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 3, output_tokens: 2 },
    };
  }
  if (path.endsWith('/v1/responses')) {
    return {
      id: 'resp_1',
      created_at: 1,
      model: 'gpt',
      status: 'completed',
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [
            { type: 'output_text', text: 'Hi from OpenAI', annotations: [] },
          ],
        },
      ],
      usage: { input_tokens: 3, output_tokens: 2 },
    };
  }
  if (path.includes(':generateContent')) {
    return {
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'Hi from Google' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 },
    };
  }
  if (path.endsWith('/v1/chat/completions')) {
    return {
      id: 'chat_1',
      object: 'chat.completion',
      created: 1,
      model: 'm',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hi from chat' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    };
  }
  return null;
}

describe('HttpPylonModels', () => {
  let server: Server;
  let url: string;
  let received: { path: string; headers: IncomingHttpHeaders }[];

  beforeAll(async () => {
    received = [];
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const path = req.url ?? '';
        received.push({ path, headers: req.headers });
        const answer = answerFor(path);
        res
          .writeHead(answer ? 200 : 404, { 'content-type': 'application/json' })
          .end(JSON.stringify(answer ?? {}));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const generate = async (provider: string, model: string) => {
    const created = new HttpPylonModels(url).create(provider, model, {
      token: 'task-token',
      executionId: 'execution-1',
    }) as unknown as {
      doGenerate: (options: unknown) => Promise<{
        content: { type: string; text?: string }[];
      }>;
    };
    const result = await created.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
    return result.content.find((part) => part.type === 'text')?.text;
  };

  it.each([
    [
      'anthropic',
      'claude-sonnet-5-5',
      '/v1/providers/anthropic/v1/messages',
      'x-api-key',
      'task-token',
      'Hi from Anthropic',
    ],
    [
      'openai',
      'gpt-6.2-sol',
      '/v1/providers/openai/v1/responses',
      'authorization',
      'Bearer task-token',
      'Hi from OpenAI',
    ],
    [
      'google',
      'gemini-3-pro',
      '/v1/providers/google/v1beta/models/gemini-3-pro:generateContent',
      'x-goog-api-key',
      'task-token',
      'Hi from Google',
    ],
    [
      'mistral',
      'mistral-large',
      '/v1/providers/mistral/v1/chat/completions',
      'authorization',
      'Bearer task-token',
      'Hi from chat',
    ],
    [
      'ollama',
      'qwen3:8b',
      '/v1/providers/ollama/v1/chat/completions',
      'authorization',
      'Bearer task-token',
      'Hi from chat',
    ],
  ])(
    "calls %s's own API at Pylon, with the task token as its key",
    async (provider, model, path, header, value, text) => {
      await expect(generate(provider, model)).resolves.toBe(text);
      const request = received.at(-1)!;
      expect(request.path).toBe(path);
      expect(request.headers[header]).toBe(value);
      expect(request.headers['x-aether-execution-id']).toBe('execution-1');
    },
  );
});
