import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { createPolisHttpClient, PolisApi } from '@pistis/core';

import { PolisDirectory, type OrganizationRole } from './polis-directory.js';

export const POLIS_DIRECTORY_OPTIONS = Symbol('POLIS_DIRECTORY_OPTIONS');

export interface PolisDirectoryOptions {
  baseUrl: string;
  timeoutMs?: number;
}

/** `PolisDirectory` over Polis's API (the client generated from its spec). */
@Injectable()
export class HttpPolisDirectory extends PolisDirectory {
  private readonly client: ReturnType<typeof createPolisHttpClient>;

  constructor(@Inject(POLIS_DIRECTORY_OPTIONS) options: PolisDirectoryOptions) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createPolisHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
    });
  }

  async membershipRoles(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationRole[] | null> {
    let cursor: string | undefined;
    do {
      const { data, response } = await this.call(() =>
        PolisApi.listMembershipsOfSubject({
          client: this.client,
          query: { subjectType: 'user', subject: userId, limit: 100, cursor },
        }),
      );
      if (!response?.ok || !data) {
        throw this.unavailable(response?.status);
      }
      const membership = data.items.find(
        (item) => item.organizationId === organizationId,
      );
      if (membership) {
        return membership.roles;
      }
      cursor = data.nextCursor ?? undefined;
    } while (cursor);

    return null;
  }

  async organizationStatus(
    organizationId: string,
  ): Promise<'active' | 'suspended' | null> {
    const { data, response } = await this.call(() =>
      PolisApi.getOrganization({
        client: this.client,
        path: { organizationId },
      }),
    );
    if (response?.status === 404) {
      return null;
    }
    if (!response?.ok || !data) {
      throw this.unavailable(response?.status);
    }

    return data.status;
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      throw this.unavailable(
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private unavailable(reason: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException(
      `Polis can't be reached right now (${String(reason)}).`,
    );
  }
}
