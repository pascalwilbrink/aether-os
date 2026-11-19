import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { OpenBaoSecretStore } from './openbao-secret-store.js';
import { SecretStoreUnavailableError } from './secret-store.js';

describe('OpenBaoSecretStore', () => {
  let server: Server;
  let address: string;
  const requests: {
    method?: string;
    url?: string;
    token?: string | string[];
    body?: string;
  }[] = [];
  /** What was written, by data path. */
  const written = new Map<string, unknown>();

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => respond(req, res, body));
    });
    const respond = (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
      body: string,
    ) => {
      requests.push({
        method: req.method,
        url: req.url,
        token: req.headers['x-vault-token'],
        body: body || undefined,
      });
      res.setHeader('content-type', 'application/json');
      if (req.headers['x-vault-token'] !== 'dev-root-token') {
        res.statusCode = 403;
        res.end(JSON.stringify({ errors: ['permission denied'] }));
      } else if (
        req.method === 'POST' &&
        req.url?.startsWith('/v1/secret/data/')
      ) {
        written.set(req.url, (JSON.parse(body) as { data: unknown }).data);
        res.end(JSON.stringify({ data: { version: 1 } }));
      } else if (
        req.method === 'DELETE' &&
        req.url?.startsWith('/v1/secret/metadata/')
      ) {
        written.delete(req.url.replace('/metadata/', '/data/'));
        res.statusCode = 204;
        res.end();
      } else if (req.method === 'GET' && req.url && written.has(req.url)) {
        res.end(JSON.stringify({ data: { data: written.get(req.url) } }));
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
    };
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
      method: 'GET',
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

  it('writes a secret, and deletes it with every version', async () => {
    await store().write('orgs/org-2/llm/openai', { apiKey: 'sk-new' });
    expect(requests.at(-1)).toMatchObject({
      method: 'POST',
      url: '/v1/secret/data/orgs/org-2/llm/openai',
      body: JSON.stringify({ data: { apiKey: 'sk-new' } }),
    });
    await expect(store().read('orgs/org-2/llm/openai')).resolves.toEqual({
      apiKey: 'sk-new',
    });

    await store().delete('orgs/org-2/llm/openai');
    expect(requests.at(-1)).toMatchObject({
      method: 'DELETE',
      url: '/v1/secret/metadata/orgs/org-2/llm/openai',
    });
    await expect(store().read('orgs/org-2/llm/openai')).resolves.toBeNull();
    // Nothing there is fine.
    await expect(
      store().delete('orgs/org-2/llm/openai'),
    ).resolves.toBeUndefined();
    await expect(
      store('wrong').write('orgs/org-2/llm/openai', { apiKey: 'x' }),
    ).rejects.toBeInstanceOf(SecretStoreUnavailableError);
  });
});
