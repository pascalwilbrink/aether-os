import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

import { createPolisHttpClient, PolisApi, ServiceTokens } from '@pistis/core';

import {
  PolisDirectory,
  type OrganizationRole,
  type ProjectRole,
  type SubjectType,
} from './polis-directory.js';

export const POLIS_DIRECTORY_OPTIONS = Symbol('POLIS_DIRECTORY_OPTIONS');

export interface PolisDirectoryOptions {
  baseUrl: string;
  timeoutMs?: number;
}

/** `PolisDirectory` over Polis's API (the client generated from its spec). */
@Injectable()
export class HttpPolisDirectory extends PolisDirectory {
  private readonly client: ReturnType<typeof createPolisHttpClient>;

  constructor(
    @Inject(POLIS_DIRECTORY_OPTIONS) options: PolisDirectoryOptions,
    tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.client = createPolisHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      // Pistis's own service token (platform:read), for Polis's bearer auth.
      auth: () => tokens.token(),
    });
  }

  async membershipRoles(
    userId: string,
    organizationId: string,
    subjectType: SubjectType = 'user',
  ): Promise<OrganizationRole[] | null> {
    let cursor: string | undefined;
    do {
      const { data, response } = await this.call(() =>
        PolisApi.listMembershipsOfSubject({
          client: this.client,
          query: { subjectType, subject: userId, limit: 100, cursor },
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

  async projectRoles(
    userId: string,
    organizationId: string,
    subjectType: SubjectType = 'user',
  ): Promise<Record<string, ProjectRole>> {
    const roles: Record<string, ProjectRole> = {};
    let cursor: string | undefined;
    do {
      const { data, response } = await this.call(() =>
        PolisApi.listProjectMembershipsOfSubject({
          client: this.client,
          query: {
            organizationId,
            subjectType,
            subject: userId,
            limit: 100,
            cursor,
          },
        }),
      );
      if (!response?.ok || !data) {
        throw this.unavailable(response?.status);
      }
      for (const item of data.items) {
        roles[item.projectId] = item.role;
      }
      cursor = data.nextCursor ?? undefined;
    } while (cursor);

    return roles;
  }

  async userMembers(
    organizationId: string,
    page: { limit: number; cursor?: string },
  ): Promise<{ subjects: string[]; nextCursor: string | null }> {
    const { data, response } = await this.call(() =>
      PolisApi.listMemberships({
        client: this.client,
        path: { organizationId },
        query: { subjectType: 'user', limit: page.limit, cursor: page.cursor },
      }),
    );
    if (response?.status === 400) {
      // Polis refused the cursor: the caller's, passed on.
      throw new BadRequestException('The cursor is invalid.');
    }
    if (!response?.ok || !data) {
      throw this.unavailable(response?.status);
    }

    return {
      subjects: data.items.map((item) => item.subject),
      nextCursor: data.nextCursor,
    };
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
