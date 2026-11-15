import { Inject, Injectable } from '@nestjs/common';

import { createPolisHttpClient, PolisApi } from '@hephaestus/core';

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

  constructor(@Inject(POLIS_CLIENT_OPTIONS) options: PolisClientOptions) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createPolisHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
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

  /** The body of a 2xx, null for a 404, `PolisUnavailableError` otherwise. */
  private async call<T>(
    request: () => Promise<{ data?: T; response?: Response }>,
  ): Promise<T | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        const { data, response } = await request();
        if (response?.status === 404) {
          return null;
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
