import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceTokens } from '@hephaestus/core';

import { HttpPolisClient } from './http-polis.client.js';
import { PolisUnavailableError } from './tenancy.errors.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

class FixedTokens extends ServiceTokens {
  constructor(private readonly value: string | Error) {
    super();
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
});
