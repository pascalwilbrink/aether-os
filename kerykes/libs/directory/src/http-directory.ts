import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  createErgonHttpClient,
  createPistisHttpClient,
  createPolisHttpClient,
  ErgonApi,
  fetchFailure,
  PistisApi,
  PolisApi,
  ServiceTokens,
} from '@kerykes/core';

import {
  Directory,
  type MemberInfo,
  type ProjectGrantInfo,
  type UserInfo,
  type WorkAssigneeInfo,
} from './directory.js';
import { DirectoryUnavailableError } from './directory.errors.js';

export const DIRECTORY_OPTIONS = Symbol('DIRECTORY_OPTIONS');

export interface DirectoryOptions {
  polisUrl: string;
  pistisUrl: string;
  ergonUrl: string;
  /** Per request; docs/engineering.md's default is 5 seconds. */
  timeoutMs?: number;
}

/** Pages read at most, so a broken cursor can't loop forever. */
const MAX_PAGES = 100;

/**
 * `Directory` over Polis's and Pistis's HTTP APIs, with the clients
 * generated from their specs. Every call has a timeout; a call is retried
 * once on a network error, and once with a fresh token after a 401.
 */
@Injectable()
export class HttpDirectory extends Directory {
  private readonly logger = new Logger(HttpDirectory.name);
  private readonly polis: ReturnType<typeof createPolisHttpClient>;
  private readonly pistis: ReturnType<typeof createPistisHttpClient>;
  private readonly ergon: ReturnType<typeof createErgonHttpClient>;

  constructor(
    @Inject(DIRECTORY_OPTIONS) options: DirectoryOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    const fetchWithTimeout: typeof fetch = (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    // Kerykes's own token from Pistis (client credentials, platform:read).
    const auth = () => tokens.token();
    this.polis = createPolisHttpClient({
      baseUrl: options.polisUrl,
      fetch: fetchWithTimeout,
      auth,
    });
    this.pistis = createPistisHttpClient({
      baseUrl: options.pistisUrl,
      fetch: fetchWithTimeout,
      auth,
    });
    this.ergon = createErgonHttpClient({
      baseUrl: options.ergonUrl,
      fetch: fetchWithTimeout,
      auth,
    });
  }

  async organizationMembers(organizationId: string): Promise<MemberInfo[]> {
    const members: MemberInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.call('Polis', () =>
        PolisApi.listMemberships({
          client: this.polis,
          path: { organizationId },
          query: { subjectType: 'user', limit: 100, cursor },
        }),
      );
      if (!result) return members;
      for (const item of result.items) {
        members.push({
          membershipId: item.id,
          sub: item.subject,
          roles: item.roles,
        });
      }
      if (!result.nextCursor) return members;
      cursor = result.nextCursor;
    }
    return members;
  }

  async projectGrants(
    organizationId: string,
    sub: string,
  ): Promise<ProjectGrantInfo[]> {
    const grants: ProjectGrantInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.call('Polis', () =>
        PolisApi.listProjectMembershipsOfSubject({
          client: this.polis,
          query: {
            organizationId,
            subjectType: 'user',
            subject: sub,
            limit: 100,
            cursor,
          },
        }),
      );
      if (!result) return grants;
      for (const item of result.items) {
        grants.push({
          membershipId: item.id,
          projectId: item.projectId,
          role: item.role,
        });
      }
      if (!result.nextCursor) return grants;
      cursor = result.nextCursor;
    }
    return grants;
  }

  async projectName(
    organizationId: string,
    projectId: string,
  ): Promise<string | null> {
    const project = await this.call('Polis', () =>
      PolisApi.getProject({
        client: this.polis,
        path: { organizationId, projectId },
      }),
    );
    return project?.name ?? null;
  }

  async user(sub: string): Promise<UserInfo | null> {
    const user = await this.call('Pistis', () =>
      PistisApi.getUser({ client: this.pistis, path: { userId: sub } }),
    );
    return user
      ? {
          displayName: user.displayName,
          email: user.email,
          status: user.status,
        }
      : null;
  }

  async personUser(
    organizationId: string,
    personId: string,
  ): Promise<string | null> {
    const person = await this.call('Polis', () =>
      PolisApi.getPerson({
        client: this.polis,
        path: { organizationId, personId },
      }),
    );
    return person?.userId ?? null;
  }

  async workAssignments(
    organizationId: string,
    workItemId: string,
  ): Promise<WorkAssigneeInfo[] | null> {
    const assignees: WorkAssigneeInfo[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await this.call('Ergon', () =>
        ErgonApi.listWorkAssignments({
          client: this.ergon,
          path: { organizationId, workItemId },
          query: { status: 'active', limit: 100, cursor },
        }),
      );
      if (!result) return page === 0 ? null : assignees;
      for (const item of result.items) {
        assignees.push({
          kind: item.assignee.kind,
          id: item.assignee.id,
          role: item.role,
        });
      }
      if (!result.nextCursor) return assignees;
      cursor = result.nextCursor;
    }
    return assignees;
  }

  /**
   * The body of a 2xx, null for a 404 (or a 400: not an ID the service
   * knows), `DirectoryUnavailableError` otherwise.
   */
  private async call<T>(
    service: 'Polis' | 'Pistis' | 'Ergon',
    request: () => Promise<{
      data?: T;
      error?: unknown;
      response?: Response;
    }>,
  ): Promise<T | null> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      try {
        const { data, error, response } = await request();
        if (!response) {
          // The generated client returns a failed fetch (no connection, a
          // timeout) as `error` instead of throwing it: retried below.
          throw new NoAnswer(error);
        }
        if (response.status === 404 || response.status === 400) {
          return null;
        }
        if (response.status === 401 && !refreshed) {
          refreshed = true;
          attempt--;
          this.tokens.invalidate();
          continue;
        }
        if (!response.ok || data === undefined) {
          this.logger.warn(`${service} answered ${response.status}`);
          throw new DirectoryUnavailableError(
            service,
            `HTTP ${response.status}`,
          );
        }
        return data;
      } catch (error) {
        if (error instanceof DirectoryUnavailableError) {
          throw error;
        }
        if (attempt >= 2) {
          const reason = fetchFailure(
            error instanceof NoAnswer ? error.error : error,
          );
          this.logger.warn(`${service} didn't answer: ${reason}`);
          throw new DirectoryUnavailableError(service, reason);
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
