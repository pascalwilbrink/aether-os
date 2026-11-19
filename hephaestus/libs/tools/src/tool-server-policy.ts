import { isIP } from 'node:net';

import type { ToolServerAuthType } from './tool-server.entity.js';

/** What the platform allows of tool servers (`TOOL_SERVER_*`). */
export interface ToolServerPolicy {
  /** Private, loopback and link-local addresses, and `http://` (local development). */
  allowPrivate: boolean;
  /** Origins that may be sent a task's own token. */
  trustedOrigins: readonly string[];
}

/**
 * Why Hephaestus won't use this URL and authentication, or null when it
 * will: `https://` (`http://` only where private addresses are allowed), no
 * credentials in the URL, no private or loopback address written into it
 * (names are checked again when connecting, `guardedFetch`), and a task's
 * token only for a trusted origin.
 */
export function toolServerProblem(
  url: string,
  authType: ToolServerAuthType,
  policy: ToolServerPolicy,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${url} isn't a URL.`;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'A tool server is reached over https.';
  }
  if (parsed.protocol === 'http:' && !policy.allowPrivate) {
    return 'A tool server is reached over https.';
  }
  if (parsed.username || parsed.password) {
    return "A tool server's URL can't hold credentials: set a header credential instead.";
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    !policy.allowPrivate &&
    (host === 'localhost' ||
      host.endsWith('.localhost') ||
      (isIP(host) !== 0 && isPrivateAddress(host)))
  ) {
    return "Hephaestus doesn't connect to private or loopback addresses.";
  }
  if (
    authType === 'task-token' &&
    !policy.trustedOrigins.includes(parsed.origin.toLowerCase())
  ) {
    return `Only Aether-os's own tool servers are sent a task's token, and ${parsed.origin} isn't one (TOOL_SERVER_TRUSTED_ORIGINS).`;
  }
  return null;
}

/**
 * Private, loopback, link-local (cloud metadata), CGNAT, unspecified and
 * multicast addresses: nowhere a tool server should make Hephaestus
 * connect.
 */
export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) {
    return isPrivateAddress(mapped[1]);
  }
  return (
    lower === '::' ||
    lower === '::1' ||
    lower.startsWith('fc') ||
    lower.startsWith('fd') ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith('ff')
  );
}
