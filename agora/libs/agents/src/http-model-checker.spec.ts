import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceUnavailableException } from '@nestjs/common';

import { ServiceTokens } from '@agora/core';

import { HttpModelChecker } from './http-model-checker.js';

class FixedTokens extends ServiceTokens {
  token(): Promise<string> {
    return Promise.resolve('agora-token');
  }
}

const model = (status: string, kind = 'chat') => ({
  id: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  provider: 'anthropic',
  model: 'claude',
  name: 'Claude',
  kind,
  status,
});

describe('HttpModelChecker', () => {
  let server: Server;
  let baseUrl: string;
  let answers: { status: number; body?: unknown }[];
  let requests: { url?: string; authorization?: string }[];

  beforeEach(async () => {
    answers = [];
    requests = [];
    server = createServer((req, res) => {
      requests.push({ url: req.url, authorization: req.headers.authorization });
      const answer = answers.shift() ?? { status: 200, body: { items: [] } };
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const checker = () =>
    new HttpModelChecker({ baseUrl, timeoutMs: 2000 }, new FixedTokens());

  it("accepts an active chat model of Pylon's catalogue, asked with Agora's token", async () => {
    answers.push({ status: 200, body: { items: [model('active')] } });

    await checker().assertAvailable({ provider: 'anthropic', model: 'claude' });

    expect(requests).toEqual([
      {
        url: '/v1/models?provider=anthropic&model=claude',
        authorization: 'Bearer agora-token',
      },
    ]);
  });

  it.each([
    ['not in the catalogue', { status: 200, body: { items: [] } }],
    ['retired', { status: 200, body: { items: [model('retired')] } }],
    [
      'an embedding model',
      { status: 200, body: { items: [model('active', 'embedding')] } },
    ],
    [
      'of a provider Pylon has no code for',
      { status: 400, body: { code: 'VALIDATION_FAILED' } },
    ],
  ])('refuses a model %s', async (_, answer) => {
    answers.push(answer);
    await expect(
      checker().assertAvailable({ provider: 'anthropic', model: 'claude' }),
    ).rejects.toMatchObject({ code: 'MODEL_NOT_AVAILABLE' });
  });

  it("doesn't ask about an Ollama model: the organization's server has its own", async () => {
    await checker().assertAvailable({ provider: 'ollama', model: 'qwen3:8b' });
    expect(requests).toEqual([]);
  });

  it('is unavailable when Pylon fails', async () => {
    answers.push({ status: 500 });
    await expect(
      checker().assertAvailable({ provider: 'anthropic', model: 'claude' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
