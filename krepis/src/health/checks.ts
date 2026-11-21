import { fetchFailure } from '../net/fetch-failure.js';

import type { HealthCheck } from './health-check.js';

export interface HttpCheckOptions {
  required?: boolean;
  timeoutMs?: number;
  /** Statuses that count as up (default any `2xx`). */
  okStatuses?: number[];
  /** Headers to send (e.g. an API key a monitor needs; never logged). */
  headers?: Record<string, string>;
}

/** Up when `GET url` answers with an expected status. */
export function httpCheck(
  name: string,
  url: string | URL,
  options: HttpCheckOptions = {},
): HealthCheck {
  return {
    name,
    required: options.required,
    timeoutMs: options.timeoutMs,
    async check(signal) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: options.headers,
          signal,
          redirect: 'manual',
        });
      } catch (error) {
        throw new Error(fetchFailure(error));
      }
      await response.body?.cancel();
      const ok = options.okStatuses
        ? options.okStatuses.includes(response.status)
        : response.ok;
      if (!ok) {
        throw new Error(`answered HTTP ${response.status}`);
      }
      return { httpStatus: response.status };
    },
  };
}

/**
 * Another Aether-os service: up when its `/health/live` answers. Only
 * whether it runs, never its own dependencies, so one service being down
 * doesn't make every service that calls it report the same (and services
 * that call each other don't check each other in a loop). Not required by
 * default: a service that can't reach another is `degraded`, not `down`.
 */
export function serviceCheck(
  name: string,
  baseUrl: string,
  options: Omit<HttpCheckOptions, 'okStatuses'> = {},
): HealthCheck {
  return httpCheck(name, new URL('/health/live', baseUrl), {
    required: false,
    ...options,
  });
}

/**
 * OpenBao (or Vault): `GET /v1/sys/health`, which needs no token. Up when
 * it's initialized and unsealed (`200`, or `429` for a standby).
 */
export function openBaoCheck(
  address: string,
  options: Omit<HttpCheckOptions, 'okStatuses'> = {},
): HealthCheck {
  const check = httpCheck('openbao', new URL('/v1/sys/health', address), {
    ...options,
    okStatuses: [200, 429],
  });
  return {
    ...check,
    async check(signal) {
      try {
        return await check.check(signal);
      } catch (error) {
        const message = (error as Error).message;
        // sys/health's own statuses (https://openbao.org/api-docs/system/health/).
        const why: Record<string, string> = {
          'answered HTTP 501': 'not initialized',
          'answered HTTP 503': 'sealed',
        };
        throw new Error(why[message] ?? message);
      }
    },
  };
}

/** A check only when its setting is there: `...checkIf(LOCULUS_URL, (url) => serviceCheck('loculus', url))`. */
export function checkIf(
  setting: string | undefined | null,
  make: (setting: string) => HealthCheck,
): HealthCheck[] {
  return setting ? [make(setting)] : [];
}
