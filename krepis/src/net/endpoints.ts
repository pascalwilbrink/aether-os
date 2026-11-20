import { isIP } from 'node:net';

/**
 * Why a service won't call this URL, or null when it will: `https://`
 * (`http://` only where private addresses are allowed), no credentials in
 * the URL, and no private or loopback address written into it (names are
 * checked again when connecting, `guardedFetch`). For URLs an organization
 * gives a service to call: tool servers, model endpoints (Ollama).
 */
export function endpointProblem(
  url: string,
  { allowPrivate }: { allowPrivate: boolean },
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `${url} isn't a URL.`;
  }
  if (
    parsed.protocol !== 'https:' &&
    !(parsed.protocol === 'http:' && allowPrivate)
  ) {
    return 'It is reached over https.';
  }
  if (parsed.username || parsed.password) {
    return "The URL can't hold credentials.";
  }
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (
    !allowPrivate &&
    (host === 'localhost' ||
      host.endsWith('.localhost') ||
      (isIP(host) !== 0 && isPrivateAddress(host)))
  ) {
    return "Aether-os doesn't connect to private or loopback addresses.";
  }
  return null;
}

/**
 * Private, loopback, link-local (cloud metadata), CGNAT, unspecified and
 * multicast addresses: nowhere an organization's URL should make a service
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
