import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceTokens } from '@seshat/core';

import { EmbeddingsError } from './embeddings.js';
import { HttpEmbeddings } from './http-embeddings.js';

class CountingTokens extends ServiceTokens {
  issued = 0;
  token(): Promise<string> {
    return Promise.resolve(`token-${++this.issued}`);
  }
}

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';

describe('HttpEmbeddings', () => {
  let server: Server;
  let baseUrl: string;
  let answers: { status: number; body?: unknown }[];
  let requests: {
    url?: string;
    authorization?: string;
    purpose?: string;
    body: Record<string, unknown>;
  }[];

  beforeEach(async () => {
    answers = [];
    requests = [];
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        const body = JSON.parse(data) as Record<string, unknown>;
        requests.push({
          url: req.url,
          authorization: req.headers.authorization,
          purpose: req.headers['x-aether-purpose'] as string | undefined,
          body,
        });
        const inputs = body.input as string[];
        const answer = answers.shift() ?? {
          status: 200,
          body: {
            provider: 'openai',
            model: 'text-embedding-3-small',
            dimensions: 2,
            // Out of order, as a provider may answer.
            data: inputs
              .map((_, index) => ({ index, embedding: [index, 1] }))
              .reverse(),
            usage: { inputTokens: 4, costUsd: '0.000001' },
          },
        };
        res.writeHead(answer.status, { 'content-type': 'application/json' });
        res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const embeddings = (tokens = new CountingTokens()) =>
    new HttpEmbeddings(
      { baseUrl, model: 'openai/text-embedding-3-small', timeoutMs: 2000 },
      tokens,
    );

  it("embeds texts for the project with Seshat's own token, in order", async () => {
    await expect(
      embeddings().embed(ORG, PROJECT, ['first', 'second']),
    ).resolves.toEqual([
      [0, 1],
      [1, 1],
    ]);
    expect(requests).toEqual([
      {
        url: `/v1/organizations/${ORG}/projects/${PROJECT}/embeddings`,
        authorization: 'Bearer token-1',
        purpose: 'knowledge',
        body: {
          provider: 'openai',
          model: 'text-embedding-3-small',
          input: ['first', 'second'],
        },
      },
    ]);
  });

  it('gets a fresh token once when Pylon refuses the cached one', async () => {
    answers.push({ status: 401, body: { code: 'UNAUTHORIZED' } });
    const tokens = new CountingTokens();
    await embeddings(tokens).embed(ORG, PROJECT, ['text']);
    expect(requests.map((request) => request.authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ]);
  });

  it.each([
    [402, 'BUDGET_EXHAUSTED', true],
    [503, 'UNAVAILABLE', true],
    [409, 'MODEL_KEY_MISSING', false],
    [409, 'MODEL_NOT_AVAILABLE', false],
  ])(
    'says whether trying again soon helps (%s %s)',
    async (status, code, retryable) => {
      answers.push({ status, body: { code, detail: 'Why.' } });
      const error = await embeddings()
        .embed(ORG, PROJECT, ['text'])
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EmbeddingsError);
      expect(error).toMatchObject({
        retryable,
        message: `Pylon answered ${status} ${code}: Why.`,
      });
    },
  );

  it("is retryable when Pylon doesn't answer at all", async () => {
    await new Promise((resolve) => server.close(resolve));
    const error = await embeddings()
      .embed(ORG, PROJECT, ['text'])
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ retryable: true });
    // For afterEach.
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
  });
});
