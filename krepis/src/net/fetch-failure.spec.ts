import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchFailure } from './fetch-failure.js';

/** A local port nothing listens on any more. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('fetchFailure', () => {
  it("names a refused connection's reason", async () => {
    const error = await fetch(`http://127.0.0.1:${await closedPort()}/`).catch(
      (e: unknown) => e,
    );
    expect(fetchFailure(error)).toMatch(/^fetch failed: .*ECONNREFUSED/);
  });

  it('says a request timed out', async () => {
    const error = await new Promise((resolve) => {
      const signal = AbortSignal.timeout(1);
      signal.addEventListener('abort', () => resolve(signal.reason));
    });
    expect(fetchFailure(error)).toMatch(/^no answer in time/);
  });

  it('describes anything else', () => {
    expect(fetchFailure(new Error('boom'))).toBe('boom');
    expect(fetchFailure(undefined)).toBe('no response');
    expect(fetchFailure({ code: 'X' })).toBe('{"code":"X"}');
  });
});
