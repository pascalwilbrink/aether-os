import { lookup } from 'node:dns';
import { isIP } from 'node:net';

import { Agent, fetch as undiciFetch } from 'undici';

import { isPrivateAddress } from './tool-server-policy.js';

/**
 * `fetch` for tool servers. Unless private addresses are allowed, every
 * address a name resolves to is checked when connecting (so a name can't
 * point at the metadata service or Hephaestus's own network, even after it
 * was checked once), and addresses written into the URL before. Redirects
 * are refused: a server answers where it was registered.
 */
export function guardedFetch(allowPrivate: boolean): typeof fetch {
  const dispatcher = allowPrivate
    ? undefined
    : new Agent({
        connect: {
          lookup: (hostname, options, callback) => {
            lookup(hostname, { ...options, all: true }, (error, addresses) => {
              if (error) {
                callback(error, '', 0);
                return;
              }
              const refused = addresses.find((entry) =>
                isPrivateAddress(entry.address),
              );
              if (refused) {
                callback(
                  new Error(
                    `${hostname} resolves to a private address (${refused.address})`,
                  ),
                  '',
                  0,
                );
                return;
              }
              const first = addresses[0];
              callback(null, first.address, first.family);
            });
          },
        },
      });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (!allowPrivate && isIP(host) !== 0 && isPrivateAddress(host)) {
      throw new Error(`${host} is a private address`);
    }
    return undiciFetch(url, {
      ...(init as object),
      redirect: 'error',
      ...(dispatcher ? { dispatcher } : {}),
    } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>;
  }) as unknown as typeof fetch;
}
