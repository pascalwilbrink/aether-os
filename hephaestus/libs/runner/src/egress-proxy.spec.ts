import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';

import { blockedHostsIn, EGRESS_PROXY_SOURCE } from './egress-proxy.js';

/** The proxy script in a child process, as its container runs it. */
async function startProxy(env: Record<string, string>) {
  const port = await freePort();
  const child = spawn(process.execPath, ['-e', EGRESS_PROXY_SOURCE], {
    env: { PATH: process.env.PATH ?? '', PORT: String(port), ...env },
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('proxy never started')),
      10_000,
    );
    child.stdout.on('data', () => {
      if (output.includes('"event":"ready"')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  return { port, child, output: () => output };
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer().listen(0, () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** A CONNECT through the proxy: the status line it answers with. */
function connect(proxyPort: number, target: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = http.request({
      port: proxyPort,
      method: 'CONNECT',
      path: target,
    });
    request.on('connect', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    request.on('error', reject);
    request.end();
  });
}

/** A plain HTTP request through the proxy. */
function get(
  proxyPort: number,
  url: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(
        { port: proxyPort, path: url, headers: { host: new URL(url).host } },
        (response) => {
          let body = '';
          response.on('data', (chunk: Buffer) => (body += chunk.toString()));
          response.on('end', () =>
            resolve({ status: response.statusCode ?? 0, body }),
          );
        },
      )
      .on('error', reject);
  });
}

describe('egress proxy', () => {
  let upstream: http.Server;
  let upstreamPort: number;
  const children: ChildProcess[] = [];

  beforeAll(async () => {
    upstream = http.createServer((req, res) => res.end(`hello ${req.url}`));
    await new Promise<void>((resolve) => upstream.listen(0, resolve));
    upstreamPort = (upstream.address() as AddressInfo).port;
  });

  afterAll(async () => {
    for (const child of children) child.kill();
    await new Promise((resolve) => upstream.close(resolve));
  });

  const proxy = async (env: Record<string, string>) => {
    const started = await startProxy(env);
    children.push(started.child);
    return started;
  };

  it('tunnels and forwards to allowed hosts, and refuses the rest', async () => {
    const { port, output } = await proxy({
      ALLOWED_HOSTS: 'localhost,*.registry.test',
      ALLOWED_PORTS: String(upstreamPort),
      BLOCK_PRIVATE: 'false',
    });

    expect(await connect(port, `localhost:${upstreamPort}`)).toBe(200);
    await expect(
      get(port, `http://localhost:${upstreamPort}/pkg`),
    ).resolves.toEqual({
      status: 200,
      body: 'hello /pkg',
    });

    // Not on the list, a port that isn't allowed, an IP literal.
    expect(await connect(port, 'example.com:443')).toBe(403);
    expect(await connect(port, 'localhost:22')).toBe(403);
    expect(await connect(port, `127.0.0.1:${upstreamPort}`)).toBe(403);
    const refused = await get(port, 'http://example.org/');
    expect(refused).toMatchObject({ status: 403 });
    expect(refused.body).toContain('example.org (not on the allowlist)');

    expect(blockedHostsIn(output())).toEqual([
      '127.0.0.1',
      'example.com',
      'example.org',
      'localhost',
    ]);
  });

  it('refuses allowed hosts that resolve to private addresses', async () => {
    const { port, output } = await proxy({
      ALLOWED_HOSTS: 'localhost',
      ALLOWED_PORTS: String(upstreamPort),
    });

    expect(await connect(port, `localhost:${upstreamPort}`)).toBe(403);
    expect(output()).toContain('"reason":"private address"');
  });

  it("matches a wildcard's subdomains, not the domain itself", async () => {
    const { port, output } = await proxy({ ALLOWED_HOSTS: '*.registry.test' });

    // Allowed, then unresolvable (no such domain): refused for that reason.
    expect(await connect(port, 'npm.registry.test:443')).toBe(403);
    expect(await connect(port, 'registry.test:443')).toBe(403);
    expect(output()).toContain(
      '"host":"npm.registry.test","port":443,"reason":"unresolvable"',
    );
    expect(output()).toContain(
      '"host":"registry.test","port":443,"reason":"not on the allowlist"',
    );
  });
});
