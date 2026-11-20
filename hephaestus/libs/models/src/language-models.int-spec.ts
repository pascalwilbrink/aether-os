import { Agent } from '@mastra/core/agent';

import { FakeOllama } from '../../../test/fake-ollama.js';
import { MastraModelRouter } from './language-models.js';

describe('MastraModelRouter: Ollama (a stand-in server)', () => {
  let ollama: FakeOllama;

  beforeEach(async () => {
    ollama = await new FakeOllama().start();
  });
  afterEach(async () => {
    await ollama.stop();
  });

  const agent = (router: MastraModelRouter, apiKey?: string) =>
    new Agent({
      id: 'ollama-test',
      name: 'Ollama test',
      instructions: 'Answer briefly.',
      model: router.create('ollama/qwen3:8b', {
        baseUrl: ollama.url,
        ...(apiKey ? { apiKey } : {}),
      }),
    });

  it("calls the server's OpenAI-compatible API, with its key when it has one", async () => {
    const result = await agent(
      new MastraModelRouter({ allowPrivate: true }),
      'ollama-secret',
    ).generate('Hi');

    expect(result.text).toBe('Hello from Ollama.');
    const call = ollama.requests.find(
      (request) => request.path === '/v1/chat/completions',
    );
    expect(call).toMatchObject({
      method: 'POST',
      body: expect.objectContaining({ model: 'qwen3:8b' }),
    });
    expect(call!.headers.authorization).toBe('Bearer ollama-secret');
    expect(result.usage).toMatchObject({ inputTokens: 12, outputTokens: 4 });
  });

  it('sends no key when the server has none', async () => {
    await agent(new MastraModelRouter({ allowPrivate: true })).generate('Hi');
    expect(ollama.requests.at(-1)!.headers.authorization).toBeUndefined();
  });

  it("doesn't reach a private address unless allowed", async () => {
    const result = await agent(new MastraModelRouter({ allowPrivate: false }))
      .generate('Hi')
      .catch((error: unknown) => error);
    expect(
      result instanceof Error ||
        (result as { error?: unknown }).error !== undefined,
    ).toBe(true);
    expect(ollama.requests).toHaveLength(0);
  });
});
