import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ProxenosEvents, Transactional, type Env } from '@proxenos/core';
import {
  InstallationsService,
  RepositoriesService,
} from '@proxenos/installations';
import { RepositoryLinksService } from '@proxenos/repositories';

/** The part of GitHub's `push` payload Proxenos reads. */
export interface GitHubPushPayload {
  ref?: string;
  before?: string;
  after?: string;
  deleted?: boolean;
  installation?: { id?: number };
  repository?: { id?: number; default_branch?: string };
  sender?: { login?: string; type?: string };
}

/**
 * Pushes to the default branch of connected repositories become
 * `git.pushed` (docs/knowledge.md, Repository documents: Seshat indexes the
 * repository's documents again). Pushes to other branches, Aether-os's own
 * `aether/*` branches among them, and deleting the branch aren't published.
 */
@Injectable()
export class PushEventsService {
  constructor(
    private readonly installations: InstallationsService,
    private readonly repositories: RepositoriesService,
    private readonly links: RepositoryLinksService,
    private readonly events: ProxenosEvents,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** False when it isn't a push to the default branch of a connected repository. */
  @Transactional()
  async received(
    delivery: { id: string; deliveryId: string },
    payload: GitHubPushPayload,
  ): Promise<boolean> {
    const branch = payload.repository?.default_branch;
    if (
      !branch ||
      payload.deleted ||
      payload.ref !== `refs/heads/${branch}` ||
      !payload.before ||
      !payload.after ||
      payload.installation?.id === undefined ||
      payload.repository?.id === undefined
    ) {
      return false;
    }
    const installation = await this.installations.findByExternalId(
      String(payload.installation.id),
    );
    if (installation?.status !== 'active') {
      return false;
    }
    const repository = await this.repositories.findByExternalId(
      installation.id,
      String(payload.repository.id),
    );
    if (repository?.status !== 'available') {
      return false;
    }
    const links = await this.links.linksOf(repository.id);
    const bot = `${this.config.get('GITHUB_APP_SLUG', { infer: true }) ?? ''}[bot]`;
    await this.events.emit({
      eventType: 'git.pushed',
      // Each delivery is its own event: none replaces another.
      aggregateId: delivery.id,
      aggregateVersion: 1,
      organizationId: installation.organizationId,
      payload: {
        webhookDeliveryId: delivery.id,
        deliveryId: delivery.deliveryId,
        repositoryId: repository.id,
        repository: repository.fullName,
        projectIds: links.map((link) => link.projectId),
        links,
        branch,
        before: payload.before,
        after: payload.after,
        fromAetherOs:
          payload.sender?.type === 'Bot' && payload.sender.login === bot,
      },
    });
    return true;
  }
}
