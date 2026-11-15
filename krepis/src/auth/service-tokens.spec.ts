import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ServiceUnavailableException } from '@nestjs/common';

import { TestTokens } from '../testing/tokens.js';
import { ClientCredentialsServiceTokens } from './service-tokens.js';

describe('ClientCredentialsServiceTokens', () => {
  let server: Server;
  let issuer: string;
  let tokens: TestTokens;
  const requests: { authorization?: string; body: string }[] = [];

  beforeAll(async () => {
    tokens = await TestTokens.create();
    server = createServer((req, res) => {
      if (req.url === '/oidc/.well-known/openid-configuration') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ token_endpoint: `${issuer}/token` }));
        return;
      }
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        requests.push({ authorization: req.headers.authorization, body });
        if (
          req.headers.authorization !==
          `Basic ${Buffer.from('hephaestus:secret-secret-secret').toString('base64')}`
        ) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_client' }));
          return;
        }
        void tokens.service('hephaestus').then((token) => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({ access_token: token, token_type: 'Bearer' }),
          );
        });
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    issuer = `http://127.0.0.1:${(server.address() as AddressInfo).port}/oidc`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('gets a token with client credentials once, and reuses it', async () => {
    const source = new ClientCredentialsServiceTokens({
      issuer,
      clientId: 'hephaestus',
      clientSecret: 'secret-secret-secret',
      scope: 'platform:read',
    });

    const [first, second] = await Promise.all([source.token(), source.token()]);
    expect(first).toBe(second);
    await expect(source.token()).resolves.toBe(first);
    expect(requests).toHaveLength(1);
    expect(new URLSearchParams(requests[0].body).get('scope')).toBe(
      'platform:read',
    );
  });

  it('fails as unavailable when Pistis refuses', async () => {
    const source = new ClientCredentialsServiceTokens({
      issuer,
      clientId: 'hephaestus',
      clientSecret: 'wrong-secret-wrong',
      scope: 'platform:read',
    });
    await expect(source.token()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('fetches a new token after invalidate()', async () => {
    const source = new ClientCredentialsServiceTokens({
      issuer,
      clientId: 'hephaestus',
      clientSecret: 'secret-secret-secret',
      scope: 'platform:read',
    });
    const before = requests.length;
    await source.token();
    source.invalidate();
    await source.token();
    expect(requests.length - before).toBe(2);
  });
});
