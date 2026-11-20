import { Inject, Injectable } from '@nestjs/common';

import { createPolisHttpClient, PolisApi, ServiceTokens } from '@pylon/core';

import {
  PolisClient,
  type OrganizationState,
  type ProjectState,
} from './polis-client.js';
import { PolisUnavailableError } from './tenancy.errors.js';

export const POLIS_CLIENT_OPTIONS = Symbol('POLIS_CLIENT_OPTIONS');

export interface PolisClientOptions {
  baseUrl: string;
  /** Per request; docs/engineering.md's default is 5 seconds. */
  timeoutMs?: number;
}

/**
 * `PolisClient` over Polis's HTTP API, with the client generated from its
 * spec. Every call has a timeout; GETs are retried once on a network error.
 */
@Injectable()
export class HttpPolisClient extends PolisClient {
  private readonly client: ReturnType<typeof createPolisHttpClient>;

  constructor(
    @Inject(POLIS_CLIENT_OPTIONS) options: PolisClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createPolisHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      // Pylon's own token from Pistis (client credentials,
      // platform:read): these are platform-level reads.
      auth: () => tokens.token(),
    });
  }

  async getOrganization(
    organizationId: string,
  ): Promise<OrganizationState | null> {
    const result = await this.call(() =>
      PolisApi.getOrganization({
        client: this.client,
        path: { organizationId },
      }),
    );
    if (!result) {
      return null;
    }

    return { id: result.id, status: result.status, version: result.version };
  }

  async getProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectState | null> {
    const result = await this.call(() =>
      PolisApi.getProject({
        client: this.client,
        path: { organizationId, projectId },
      }),
    );
    if (!result) {
      return null;
    }

    return {
      id: result.id,
      organizationId: result.organizationId,
      status: result.status,
      version: result.version,
    };
  }

  /**
   * The body of a 2xx, null for a 404, `PolisUnavailableError` otherwise.
   * A refused service token (401) is dropped and the call retried once with
   * a fresh one.
   */
  private async call<T>(
    request: () => Promise<{ data?: T; response?: Response }>,
  ): Promise<T | null> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      try {
        const { data, response } = await request();
        if (response?.status === 404) {
          return null;
        }
        if (response?.status === 401 && !refreshed) {
          refreshed = true;
          attempt--;
          this.tokens.invalidate();
          continue;
        }
        if (!response?.ok || data === undefined) {
          throw new PolisUnavailableError(`HTTP ${response?.status ?? '?'}`);
        }
        return data;
      } catch (error) {
        if (error instanceof PolisUnavailableError) {
          throw error;
        }
        if (attempt >= 2) {
          throw new PolisUnavailableError(
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  }
}
