/**
 * The allowlisting egress proxy of a `restricted` sandbox (../CLAUDE.md,
 * sandboxes), as the source of a Node script run with `node -e` in its own
 * container: no image to build, and nothing but Node's standard library.
 *
 * - HTTPS: `CONNECT host:port` is tunnelled only to an allowed host on an
 *   allowed port (no TLS interception: the sandbox talks TLS to the host).
 * - HTTP: requests with an absolute URI are forwarded the same way.
 * - The host is resolved here and the connection made to that address, so
 *   DNS can't change between the check and the connection; addresses on
 *   private, loopback and link-local networks (cloud metadata) are refused
 *   unless `BLOCK_PRIVATE=false` (tests).
 * - Everything refused is answered `403` and logged as a JSON line
 *   (`{"event":"blocked","host":…}`), which Hephaestus reads back when the
 *   sandbox is destroyed.
 *
 * Settings come from its environment: `ALLOWED_HOSTS` (comma-separated;
 * `*.example.com` matches its subdomains, not itself), `ALLOWED_PORTS`
 * (default `80,443`), `PORT` (default 3128) and `BLOCK_PRIVATE`.
 */
export const EGRESS_PROXY_SOURCE = String.raw`
'use strict';
const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns/promises');

const list = (value) =>
  (value || '').split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
const allowedHosts = list(process.env.ALLOWED_HOSTS);
const allowedPorts = new Set(list(process.env.ALLOWED_PORTS || '80,443').map(Number));
const blockPrivate = process.env.BLOCK_PRIVATE !== 'false';
const port = Number(process.env.PORT || 3128);

const log = (entry) => process.stdout.write(JSON.stringify(entry) + '\n');

function hostAllowed(host) {
  host = host.toLowerCase().replace(/\.$/, '');
  return allowedHosts.some((pattern) =>
    pattern.startsWith('*.')
      ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1
      : host === pattern,
  );
}

function isPrivate(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  if (lower.startsWith('::ffff:')) return isPrivate(lower.slice(7));
  return (
    lower === '::' || lower === '::1' ||
    lower.startsWith('fc') || lower.startsWith('fd') ||
    lower.startsWith('fe8') || lower.startsWith('fe9') ||
    lower.startsWith('fea') || lower.startsWith('feb')
  );
}

/** The address to connect to, or why not. */
async function check(host, targetPort) {
  if (!hostAllowed(host)) return { refused: 'not on the allowlist' };
  if (!allowedPorts.has(targetPort)) return { refused: 'port not allowed' };
  let address;
  try {
    address = net.isIP(host) ? host : (await dns.lookup(host)).address;
  } catch {
    return { refused: 'unresolvable' };
  }
  if (blockPrivate && isPrivate(address)) return { refused: 'private address' };
  return { address };
}

function refuse(host, targetPort, reason) {
  log({ event: 'blocked', host: host.toLowerCase(), port: targetPort, reason });
  return 'Blocked by the sandbox network allowlist: ' + host + ' (' + reason + ')\n';
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url);
  } catch {
    res.writeHead(400).end('Only proxy requests (absolute URIs) are served\n');
    return;
  }
  if (url.protocol !== 'http:') {
    res.writeHead(400).end('Use CONNECT for ' + url.protocol + '\n');
    return;
  }
  const targetPort = Number(url.port || 80);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const result = await check(host, targetPort);
  if (result.refused) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end(refuse(host, targetPort, result.refused));
    return;
  }
  const headers = { ...req.headers };
  delete headers['proxy-connection'];
  delete headers['proxy-authorization'];
  const upstream = http.request(
    { host: result.address, port: targetPort, method: req.method, path: url.pathname + url.search, headers },
    (response) => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});

server.on('connect', async (req, socket, head) => {
  socket.on('error', () => undefined);
  const at = req.url.lastIndexOf(':');
  const host = (at > 0 ? req.url.slice(0, at) : req.url).replace(/^\[|\]$/g, '');
  const targetPort = at > 0 ? Number(req.url.slice(at + 1)) : 443;
  const result = await check(host, targetPort);
  if (result.refused) {
    socket.end('HTTP/1.1 403 Forbidden\r\ncontent-type: text/plain\r\n\r\n' + refuse(host, targetPort, result.refused));
    return;
  }
  const upstream = net.connect(targetPort, result.address, () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'));
  socket.on('close', () => upstream.destroy());
});

server.listen(port, () => log({ event: 'ready', port }));
`;

/** The hosts a proxy refused, from its log (JSON lines). */
export function blockedHostsIn(log: string): string[] {
  const hosts = new Set<string>();
  for (const line of log.split('\n')) {
    const start = line.indexOf('{');
    if (start < 0) continue;
    try {
      const entry = JSON.parse(line.slice(start)) as {
        event?: string;
        host?: string;
      };
      if (entry.event === 'blocked' && entry.host) hosts.add(entry.host);
    } catch {
      // Not one of the proxy's lines.
    }
  }
  return [...hosts].sort();
}
