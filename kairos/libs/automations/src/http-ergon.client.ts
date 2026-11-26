import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  createErgonHttpClient,
  ErgonApi,
  fetchFailure,
  ServiceTokens,
} from '@kairos/core';

import { ErgonClient, type WorkItem } from './ergon-client.js';
import { ErgonUnavailableError } from './automation.errors.js';

export const ERGON_CLIENT_OPTIONS = Symbol('ERGON_CLIENT_OPTIONS');

export interface ErgonClientOptions {
  baseUrl: string;
  /** Per request; docs/engineering.md's default is 5 seconds. */
  timeoutMs?: number;
}

/**
 * `ErgonClient` over Ergon's HTTP API, with the client generated from its
 * spec and Kairos's own token (`platform:read`). Every call has a timeout;
 * it's retried once on a network error, and once with a fresh token on a 401.
 */
@Injectable()
export class HttpErgonClient extends ErgonClient {
  private readonly logger = new Logger(HttpErgonClient.name);
  private readonly client: ReturnType<typeof createErgonHttpClient>;

  constructor(
    @Inject(ERGON_CLIENT_OPTIONS) options: ErgonClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createErgonHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      auth: () => tokens.token(),
    });
  }

  async getWorkItem(
    organizationId: string,
    workItemId: string,
  ): Promise<WorkItem | null> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      try {
        const { data, error, response } = await ErgonApi.getWorkItem({
          client: this.client,
          path: { organizationId, workItemId },
        });
        if (!response) {
          // A failed fetch comes back as `error`: retried below.
          throw new NoAnswer(error);
        }
        if (response.status === 404) {
          return null;
        }
        if (response.status === 401 && !refreshed) {
          refreshed = true;
          attempt--;
          this.tokens.invalidate();
          continue;
        }
        if (!response.ok || data === undefined) {
          this.logger.warn(`Ergon answered ${response.status}`);
          throw new ErgonUnavailableError(`HTTP ${response.status}`);
        }
        return data;
      } catch (error) {
        if (error instanceof ErgonUnavailableError) {
          throw error;
        }
        if (attempt >= 2) {
          const reason = fetchFailure(
            error instanceof NoAnswer ? error.error : error,
          );
          this.logger.warn(`Ergon didn't answer: ${reason}`);
          throw new ErgonUnavailableError(reason);
        }
      }
    }
  }
}

/** A request that got no response: the generated client's `error`. */
class NoAnswer extends Error {
  constructor(readonly error: unknown) {
    super('No answer');
  }
}
