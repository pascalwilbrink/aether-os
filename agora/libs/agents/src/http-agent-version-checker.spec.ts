import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceUnavailableException } from '@nestjs/common';

import { ServiceTokens } from '@agora/core';

import { AgentVersionChoiceError } from './agent.errors.js';
import { HttpAgentVersionChecker } from './http-agent-version-checker.js';

class FixedTokens extends ServiceTokens {
  issued = 0;
  invalidated = 0;
  token(): Promise<string> {
    this.issued++;
    return Promise.resolve(`token-${this.issued}`);
  }
  invalidate(): void {
    this.invalidated++;
  }
}

const orgId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const choices = {
  model: { provider: 'anthropic', model: 'claude' },
  tools: [],
};

describe('HttpAgentVersionChecker', () => {
  let server: Server;
  let baseUrl: string;
  let answers: { status: number; body?: unknown }[];
  let requests: { url?: string; authorization?: string; body: unknown }[];

  beforeEach(async () => {
    answers = [];
    requests = [];
    server = createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        requests.push({
          url: req.url,
          authorization: req.headers.authorization,
          body: JSON.parse(data),
        });
        const answer = answers.shift() ?? { status: 204 };
        res.writeHead(answer.status, {
          'content-type': 'application/problem+json',
        });
        res.end(answer.body === undefined ? '' : JSON.stringify(answer.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const modelsChecked: unknown[] = [];
  const models = {
    assertAvailable: (model: unknown) => {
      modelsChecked.push(model);
      return Promise.resolve();
    },
  };
  const checker = (tokens = new FixedTokens()) =>
    new HttpAgentVersionChecker({ baseUrl, timeoutMs: 2000 }, tokens, models);

  it('asks Hephaestus with its own token', async () => {
    await checker().assertChoosable(orgId, choices);

    expect(requests).toEqual([
      {
        url: `/v1/organizations/${orgId}/agent-version-checks`,
        authorization: 'Bearer token-1',
        // The model is Pylon's to check, before Hephaestus is asked; the
        // skills are Agora's own.
        body: { tools: [] },
      },
    ]);
    expect(modelsChecked.at(-1)).toEqual(choices.model);
  });

  it("passes on Hephaestus's refusal with its code", async () => {
    answers.push({
      status: 409,
      body: { code: 'TOOL_SERVER_INVALID', detail: 'No tool server named x.' },
    });

    const error = await checker()
      .assertChoosable(orgId, choices)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AgentVersionChoiceError);
    expect(error).toMatchObject({
      code: 'TOOL_SERVER_INVALID',
      message: 'No tool server named x.',
    });
  });

  it('retries once with a new token when its token is refused', async () => {
    const tokens = new FixedTokens();
    answers.push({ status: 401 });

    await checker(tokens).assertChoosable(orgId, choices);
    expect(tokens.invalidated).toBe(1);
    expect(requests.map((r) => r.authorization)).toEqual([
      'Bearer token-1',
      'Bearer token-2',
    ]);
  });

  it('is unavailable for any other answer, or none', async () => {
    answers.push({ status: 500, body: { code: 'INTERNAL' } });
    await expect(checker().assertChoosable(orgId, choices)).rejects.toThrow(
      ServiceUnavailableException,
    );
    // Another 409 than a choice's isn't passed on as one.
    answers.push({ status: 409, body: { code: 'ORGANIZATION_SUSPENDED' } });
    await expect(checker().assertChoosable(orgId, choices)).rejects.toThrow(
      ServiceUnavailableException,
    );

    await new Promise((resolve) => server.close(resolve));
    server.listen(0);
    await expect(checker().assertChoosable(orgId, choices)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
