import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, type Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { AccessControl, runAsPrincipal, type Env } from '@proxenos/core';
import {
  GitHubApp,
  GitHubNotConfiguredError,
  GitHubUnavailableError,
} from '@proxenos/github';
import { TenancyService } from '@proxenos/tenancy';

import { ConnectRequestEntity } from './connect-request.entity.js';
import type { GitHubConnectRequest } from './dto/github-connect.request.js';
import type { GitHubConnectResponse } from './dto/github-connect.response.js';
import type { GitHubSetupQuery } from './dto/github-setup.query.js';
import {
  InstallationsService,
  InstallationTakenError,
} from './installations.service.js';

/** How long someone has to finish installing on GitHub. */
const STATE_TTL_MS = 10 * 60_000;

/** Why connecting failed, as Iris shows it (`?github=failed&reason=`). */
export type ConnectFailure =
  | 'expired'
  | 'incomplete'
  | 'not-allowed'
  | 'not-found'
  | 'installation-taken'
  | 'github-unavailable';

const hash = (state: string) =>
  createHash('sha256').update(state).digest('hex');

/**
 * Connecting the GitHub App to an organization (docs/git.md, Connecting a
 * repository): a single-use `state` bound to the organization and the
 * person, then GitHub's setup callback, which only records the installation
 * once the person's own GitHub authorization shows they can access it.
 * Without that check anyone could attach someone else's installation ID.
 */
@Injectable()
export class ConnectService {
  private readonly logger = new Logger(ConnectService.name);

  constructor(
    @InjectRepository(ConnectRequestEntity)
    private readonly requests: Repository<ConnectRequestEntity>,
    private readonly installations: InstallationsService,
    private readonly github: GitHubApp,
    private readonly tenancy: TenancyService,
    private readonly access: AccessControl,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Starts connecting (`org:manage`): the app's installation page, with a fresh state. */
  async start(
    organizationId: string,
    body: GitHubConnectRequest,
  ): Promise<GitHubConnectResponse> {
    this.assertConfigured();
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const state = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + STATE_TTL_MS);
    await this.requests.insert(
      Object.assign(new ConnectRequestEntity(), {
        id: uuidv7(),
        organizationId,
        requestedBy: this.access.principal().sub,
        returnTo: body.returnTo ?? `/orgs/${organizationId}`,
        stateHash: hash(state),
        expiresAt,
        usedAt: null,
        createdAt: now,
      } satisfies ConnectRequestEntity),
    );
    return {
      installUrl: this.github.installUrl(state),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * GitHub's setup callback: where to send the browser next. Never throws
   * for something the person did; the outcome goes back to Iris.
   */
  async complete(query: GitHubSetupQuery): Promise<string> {
    // Used up at once, whatever happens next: a state works once.
    const request = query.state ? await this.claim(query.state) : null;
    if (!request) {
      return this.back(null, { github: 'failed', reason: 'expired' });
    }
    const fail = (reason: ConnectFailure) =>
      this.back(request.returnTo, { github: 'failed', reason });
    if (!query.installation_id || !query.code) {
      return fail('incomplete');
    }
    try {
      if (
        !(await this.github.userCanAccessInstallation(
          query.code,
          query.installation_id,
        ))
      ) {
        return fail('not-allowed');
      }
      const installation = await this.github.installation(
        query.installation_id,
      );
      if (!installation) {
        return fail('not-found');
      }
      const repositories = await this.github.repositories(installation.id);
      // As the person who started it: they are the events' actor.
      await runAsPrincipal(
        {
          sub: request.requestedBy,
          subType: 'user',
          organizationId: request.organizationId,
          organizationRoles: [],
          projectRoles: {},
          projectId: null,
          taskId: null,
          taskTreeId: null,
          agentId: null,
          agentVersionId: null,
          actor: null,
          scopes: [],
        },
        () =>
          this.installations.connect(
            request.organizationId,
            request.requestedBy,
            installation,
            repositories,
          ),
      );
    } catch (error) {
      if (error instanceof InstallationTakenError) {
        return fail('installation-taken');
      }
      if (error instanceof GitHubUnavailableError) {
        this.logger.warn(`Connecting GitHub failed: ${error.message}`);
        return fail('github-unavailable');
      }
      throw error;
    }
    return this.back(request.returnTo, { github: 'connected' });
  }

  /** The unused, unexpired request for this state, marked used in the same statement. */
  private async claim(state: string): Promise<ConnectRequestEntity | null> {
    const now = new Date();
    const result = await this.requests
      .createQueryBuilder()
      .update()
      .set({ usedAt: now })
      .where({
        stateHash: hash(state),
        usedAt: IsNull(),
        expiresAt: MoreThan(now),
      })
      .returning('*')
      .execute();
    const [row] = result.raw as {
      organization_id: string;
      requested_by: string;
      return_to: string;
    }[];
    return row
      ? Object.assign(new ConnectRequestEntity(), {
          organizationId: row.organization_id,
          requestedBy: row.requested_by,
          returnTo: row.return_to,
        })
      : null;
  }

  private back(
    returnTo: string | null,
    params: Record<string, string>,
  ): string {
    const url = new URL(
      returnTo ?? '/orgs',
      this.config.get('IRIS_URL', { infer: true }),
    );
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }

  private assertConfigured(): void {
    if (!this.github.configured) {
      throw new GitHubNotConfiguredError();
    }
  }
}
