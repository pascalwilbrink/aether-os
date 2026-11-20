import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ProviderClient, ProviderUnreachableError } from './provider-client.js';

describe('ProviderClient', () => {
  let server: Server;
  let url: string;
  let answers: number[];
  let hits: number;

  beforeEach(async () => {
    answers = [];
    hits = 0;
    server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(answers.shift() ?? 200).end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  const client = (retries: number) =>
    new ProviderClient({
      retries,
      timeoutMs: 5000,
      allowPrivate: true,
      backoffMs: 1,
    });
  const send = (c: ProviderClient, signal = new AbortController().signal) =>
    c.send({ url, headers: {}, body: '{}' }, { selfHosted: false, signal });

  it('tries again on 429 and 5xx, then gives the last answer', async () => {
    answers = [503, 429];
    expect((await send(client(2))).status).toBe(200);
    expect(hits).toBe(3);

    answers = [500, 500];
    expect((await send(client(1))).status).toBe(500);

    answers = [400];
    expect((await send(client(3))).status).toBe(400);
  });

  it("says when a provider can't be reached", async () => {
    await new Promise((resolve) => server.close(resolve));
    await expect(send(client(1))).rejects.toBeInstanceOf(
      ProviderUnreachableError,
    );
    server = createServer();
    server.listen(0);
  });

  it('stops when the caller goes away', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(send(client(3), abort.signal)).rejects.toThrow();
    expect(hits).toBe(0);
  });

  it("refuses an organization's server on a private address unless allowed", async () => {
    const guarded = new ProviderClient({
      retries: 0,
      timeoutMs: 5000,
      allowPrivate: false,
    });
    await expect(
      guarded.send(
        { url, headers: {}, body: '{}' },
        { selfHosted: true, signal: new AbortController().signal },
      ),
    ).rejects.toBeInstanceOf(ProviderUnreachableError);
    expect(hits).toBe(0);
  });
});
