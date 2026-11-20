import { Inject, Injectable, Logger } from '@nestjs/common';

import { guardedFetch } from '@pylon/core';

import type { UpstreamRequest } from './provider-apis.js';

export const PROVIDER_CLIENT_OPTIONS = Symbol('PROVIDER_CLIENT_OPTIONS');

export interface ProviderClientOptions {
  /** Tries after the first, on `429`, `5xx` or no answer (`PROVIDER_RETRIES`). */
  retries: number;
  /** The longest a call may take, answer included (`PROVIDER_TIMEOUT_MS`). */
  timeoutMs: number;
  /** For organizations' own servers (`MODEL_ENDPOINT_ALLOW_PRIVATE`). */
  allowPrivate: boolean;
  /** The first wait between tries (ms), doubled each time. */
  backoffMs?: number;
}

/** The provider didn't answer, after every try. */
export class ProviderUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderUnreachableError';
  }
}

/** The longest Pylon waits on a provider's `retry-after`. */
const MAX_RETRY_AFTER_MS = 10_000;

/**
 * Sends a call on to a provider. A `429`, a `5xx` or no answer is tried
 * again (`retries` times, honouring `retry-after` up to 10 seconds) while
 * nothing has reached the caller yet; after that, the provider's last answer
 * is returned as it is. An organization's own server (`selfHosted`) is
 * reached through `guardedFetch`: no private addresses unless allowed, no
 * redirects.
 */
@Injectable()
export class ProviderClient {
  private readonly logger = new Logger(ProviderClient.name);
  private readonly guarded: typeof fetch;

  constructor(
    @Inject(PROVIDER_CLIENT_OPTIONS)
    private readonly options: ProviderClientOptions,
  ) {
    this.guarded = guardedFetch(options.allowPrivate);
  }

  async send(
    request: UpstreamRequest,
    { selfHosted, signal }: { selfHosted: boolean; signal: AbortSignal },
  ): Promise<Response> {
    const doFetch = selfHosted ? this.guarded : fetch;
    const timeout = AbortSignal.timeout(this.options.timeoutMs);
    const combined = AbortSignal.any([signal, timeout]);
    const backoff = this.options.backoffMs ?? 500;
    for (let attempt = 0; ; attempt++) {
      const last = attempt >= this.options.retries;
      let response: Response;
      try {
        response = await doFetch(request.url, {
          method: 'POST',
          headers: request.headers,
          body: request.body,
          redirect: selfHosted ? 'error' : 'follow',
          signal: combined,
        });
      } catch (error) {
        if (signal.aborted) {
          throw error;
        }
        const reason = timeout.aborted
          ? 'it took too long'
          : error instanceof Error
            ? (error.cause instanceof Error ? error.cause.message : '') ||
              error.message
            : String(error);
        if (last || timeout.aborted) {
          throw new ProviderUnreachableError(
            `The provider didn't answer: ${reason}`,
          );
        }
        this.logger.warn(`Provider call failed (${reason}); trying again`);
        await wait(backoff * 2 ** attempt, combined);
        continue;
      }
      if (last || !(response.status === 429 || response.status >= 500)) {
        return response;
      }
      this.logger.warn(`Provider answered ${response.status}; trying again`);
      await response.body?.cancel();
      await wait(
        retryAfter(response.headers.get('retry-after')) ??
          backoff * 2 ** attempt,
        combined,
      );
    }
  }
}

function retryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  }
  const at = Date.parse(header);
  return Number.isNaN(at)
    ? null
    : Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_AFTER_MS);
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason as Error);
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason as Error);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
