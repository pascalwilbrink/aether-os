import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceUnavailableException } from '@nestjs/common';

import { ServiceTokens } from '@hephaestus/core';

import {
  MAX_PINNED_BODY_CHARS,
  NoTaskContextSource,
  SeshatTaskContextSource,
} from './task-context.js';
import { TaskContextInvalidError } from './task.errors.js';

const ORG = '0195f2a0-0000-7000-8000-000000000001';
const PROJECT = '0195f2a0-0000-7000-8000-000000000002';

class CountingTokens extends ServiceTokens {
  issued = 0;
  invalidated = 0;
  token(): Promise<string> {
    this.issued += 1;
    return Promise.resolve(`token-${this.issued}`);
  }
  override invalidate(): void {
    this.invalidated += 1;
  }
}

const item = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organizationId: ORG,
  projectId: PROJECT,
  type: 'decision',
  title: `Item ${id.slice(-2)}`,
  body: 'The body.',
  status: 'accepted',
  version: 2,
  tags: [],
  references: [],
  source: { kind: 'person', taskId: null },
  supersedes: null,
  supersededBy: null,
  reviewBy: null,
  document: null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  acceptedBy: 'user-1',
  acceptedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('SeshatTaskContextSource', () => {
  let server: Server;
  let url: string;
  const requests: { path: string; auth: string | undefined }[] = [];
  /** Answers by item ID: [status, body]. */
  const answers = new Map<string, [number, unknown][]>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push({ path: req.url ?? '', auth: req.headers.authorization });
      const itemId = (req.url ?? '').split('/').at(-1) ?? '';
      const [status, body] = answers.get(itemId)?.shift() ?? [404, {}];
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requests.length = 0;
    answers.clear();
  });

  it("pins each accepted item once, with Hephaestus's own token", async () => {
    const a = '0195f2a0-0000-7000-8000-0000000000a1';
    const b = '0195f2a0-0000-7000-8000-0000000000a2';
    answers.set(a, [[200, item(a)]]);
    answers.set(b, [
      [
        200,
        item(b, {
          type: 'document',
          body: '',
          version: 1,
          document: { fileName: 'runbook.pdf' },
        }),
      ],
    ]);
    const tokens = new CountingTokens();
    const source = new SeshatTaskContextSource(url, tokens);
    expect(await source.pin(ORG, PROJECT, [a, b, a])).toEqual([
      {
        kind: 'knowledge',
        itemId: a,
        version: 2,
        type: 'decision',
        title: 'Item a1',
        body: 'The body.',
        truncated: false,
        fileName: null,
      },
      {
        kind: 'knowledge',
        itemId: b,
        version: 1,
        type: 'document',
        title: 'Item a2',
        body: '',
        truncated: false,
        fileName: 'runbook.pdf',
      },
    ]);
    expect(requests).toEqual([
      {
        path: `/v1/organizations/${ORG}/projects/${PROJECT}/knowledge/items/${a}`,
        auth: 'Bearer token-1',
      },
      {
        path: `/v1/organizations/${ORG}/projects/${PROJECT}/knowledge/items/${b}`,
        auth: 'Bearer token-2',
      },
    ]);
  });

  it('cuts a long body', async () => {
    const a = '0195f2a0-0000-7000-8000-0000000000a3';
    answers.set(a, [
      [200, item(a, { body: 'x'.repeat(MAX_PINNED_BODY_CHARS + 10) })],
    ]);
    const [pinned] = await new SeshatTaskContextSource(
      url,
      new CountingTokens(),
    ).pin(ORG, PROJECT, [a]);
    expect(pinned.body).toHaveLength(MAX_PINNED_BODY_CHARS);
    expect(pinned.truncated).toBe(true);
  });

  it('refuses items that are not accepted or not in the project', async () => {
    const proposed = '0195f2a0-0000-7000-8000-0000000000a4';
    answers.set(proposed, [[200, item(proposed, { status: 'proposed' })]]);
    const source = new SeshatTaskContextSource(url, new CountingTokens());
    await expect(source.pin(ORG, PROJECT, [proposed])).rejects.toThrow(
      new TaskContextInvalidError(
        `Knowledge item ${proposed} is proposed: a task pins accepted knowledge only.`,
      ),
    );
    await expect(
      source.pin(ORG, PROJECT, ['0195f2a0-0000-7000-8000-0000000000a5']),
    ).rejects.toBeInstanceOf(TaskContextInvalidError);
  });

  it('renews a refused token once, and is unavailable when Seshat fails', async () => {
    const a = '0195f2a0-0000-7000-8000-0000000000a6';
    answers.set(a, [
      [401, {}],
      [200, item(a)],
    ]);
    const tokens = new CountingTokens();
    const source = new SeshatTaskContextSource(url, tokens);
    expect(await source.pin(ORG, PROJECT, [a])).toHaveLength(1);
    expect(tokens.invalidated).toBe(1);

    answers.set(a, [[500, {}]]);
    await expect(source.pin(ORG, PROJECT, [a])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      new SeshatTaskContextSource(
        'http://127.0.0.1:1',
        new CountingTokens(),
      ).pin(ORG, PROJECT, [a]),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('NoTaskContextSource', () => {
  it('pins nothing, and refuses knowledge', async () => {
    const source = new NoTaskContextSource();
    expect(await source.pin(ORG, PROJECT, [])).toEqual([]);
    await expect(
      source.pin(ORG, PROJECT, ['0195f2a0-0000-7000-8000-0000000000a1']),
    ).rejects.toBeInstanceOf(TaskContextInvalidError);
  });
});
