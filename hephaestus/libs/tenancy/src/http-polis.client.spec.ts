import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceTokens } from '@hephaestus/core';

import { HttpPolisClient } from './http-polis.client.js';
import { PolisUnavailableError } from './tenancy.errors.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

class FixedTokens extends ServiceTokens {
  invalidated = 0;
  constructor(private value: string | Error) {
    super();
  }
  override invalidate(): void {
    this.invalidated++;
    this.value = 'fresh-token';
  }
  token(): Promise<string> {
    return this.value instanceof Error
      ? Promise.reject(this.value)
      : Promise.resolve(this.value);
  }
}

describe('HttpPolisClient', () => {
  let server: Server;
  let baseUrl: string;
  let seen: IncomingHttpHeaders | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      seen = req.headers;
      if (req.headers.authorization === 'Bearer stale-token') {
        res.writeHead(401, { 'content-type': 'application/problem+json' });
        res.end('{}');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: ORG,
          name: 'Acme',
          slug: 'acme',
          status: 'active',
          createdBy: 'user-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 3,
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("calls Polis with Hephaestus's own service token", async () => {
    const client = new HttpPolisClient(
      { baseUrl },
      new FixedTokens('service-token'),
    );

    await expect(client.getOrganization(ORG)).resolves.toEqual({
      id: ORG,
      status: 'active',
      version: 3,
    });
    expect(seen?.authorization).toBe('Bearer service-token');
  });

  it('treats a missing service token as Polis being unavailable', async () => {
    const client = new HttpPolisClient(
      { baseUrl },
      new FixedTokens(new Error('Pistis is down')),
    );

    await expect(client.getOrganization(ORG)).rejects.toBeInstanceOf(
      PolisUnavailableError,
    );
  });

  it('gets a fresh token once when Polis refuses the cached one', async () => {
    const tokens = new FixedTokens('stale-token');
    const client = new HttpPolisClient({ baseUrl }, tokens);

    await expect(client.getOrganization(ORG)).resolves.toMatchObject({
      id: ORG,
    });
    expect(tokens.invalidated).toBe(1);
    expect(seen?.authorization).toBe('Bearer fresh-token');
  });

  it("says why when Polis doesn't answer at all, after one retry", async () => {
    // A port nothing listens on: the generated client returns the failed
    // fetch as an error, without a response.
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));
    const client = new HttpPolisClient(
      { baseUrl: `http://127.0.0.1:${port}` },
      new FixedTokens('service-token'),
    );

    const error = await client.getOrganization(ORG).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PolisUnavailableError);
    expect((error as Error).message).toMatch(/ECONNREFUSED/);
  });
});
