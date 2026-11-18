import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { OpenBaoSecretStore } from './openbao-secret-store.js';
import { SecretStoreUnavailableError } from './secret-store.js';

describe('OpenBaoSecretStore', () => {
  let server: Server;
  let address: string;
  const requests: { url?: string; token?: string | string[] }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      requests.push({ url: req.url, token: req.headers['x-vault-token'] });
      res.setHeader('content-type', 'application/json');
      if (req.headers['x-vault-token'] !== 'dev-root-token') {
        res.statusCode = 403;
        res.end(JSON.stringify({ errors: ['permission denied'] }));
      } else if (req.url === '/v1/secret/data/orgs/org-1/llm/anthropic') {
        res.end(
          JSON.stringify({
            data: { data: { apiKey: 'sk-test' }, metadata: { version: 1 } },
          }),
        );
      } else {
        res.statusCode = 404;
        res.end(JSON.stringify({ errors: [] }));
      }
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    address = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const store = (token = 'dev-root-token') =>
    new OpenBaoSecretStore({ address, token, mount: 'secret' });

  it('reads a KV version 2 secret with its token', async () => {
    await expect(store().read('orgs/org-1/llm/anthropic')).resolves.toEqual({
      apiKey: 'sk-test',
    });
    expect(requests.at(-1)).toEqual({
      url: '/v1/secret/data/orgs/org-1/llm/anthropic',
      token: 'dev-root-token',
    });
  });

  it('is null when nothing is stored at the path', async () => {
    await expect(store().read('orgs/org-1/llm/openai')).resolves.toBeNull();
  });

  it("is unavailable when OpenBao refuses or can't be reached", async () => {
    await expect(
      store('wrong').read('orgs/org-1/llm/anthropic'),
    ).rejects.toBeInstanceOf(SecretStoreUnavailableError);
    await expect(
      new OpenBaoSecretStore({
        address: 'http://127.0.0.1:1',
        token: 't',
        mount: 'secret',
        timeoutMs: 500,
      }).read('x'),
    ).rejects.toBeInstanceOf(SecretStoreUnavailableError);
  });
});
