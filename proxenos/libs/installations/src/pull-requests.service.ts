import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { ProxenosEvents, Transactional, type Env } from '@proxenos/core';

import { InstallationsService } from './installations.service.js';
import { PullRequestEntity } from './pull-request.entity.js';
import { RepositoriesService } from './repositories.service.js';

/** The part of GitHub's `pull_request` webhook payload Proxenos reads. */
export interface GitHubPullRequestPayload {
  installation?: { id?: number };
  repository?: { id?: number };
  sender?: { login?: string; type?: string };
  pull_request?: {
    number: number;
    html_url: string;
    state: 'open' | 'closed';
    merged?: boolean;
    merged_at?: string | null;
    head: { ref: string; sha: string };
    base: { ref: string };
  };
}

/**
 * Pull requests on connected repositories (docs/git.md: "PR state follows
 * GitHub"): every `pull_request` webhook updates Proxenos's record and
 * publishes `git.pull-request.updated`, for Hephaestus (the artifact's
 * state, branch cleanup) and later Kairos.
 */
@Injectable()
export class PullRequestsService {
  constructor(
    @InjectRepository(PullRequestEntity)
    private readonly pullRequests: Repository<PullRequestEntity>,
    private readonly installations: InstallationsService,
    private readonly repositories: RepositoriesService,
    private readonly events: ProxenosEvents,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** False when the repository isn't one a connected installation covers. */
  @Transactional()
  async received(payload: GitHubPullRequestPayload): Promise<boolean> {
    const pr = payload.pull_request;
    if (
      !pr ||
      payload.installation?.id === undefined ||
      payload.repository?.id === undefined
    ) {
      return false;
    }
    const installation = await this.installations.findByExternalId(
      String(payload.installation.id),
    );
    const repository = installation
      ? await this.repositories.findByExternalId(
          installation.id,
          String(payload.repository.id),
        )
      : null;
    if (!installation || !repository) {
      return false;
    }

    const now = new Date();
    const state = pr.merged ? 'merged' : pr.state;
    const fields = {
      url: pr.html_url,
      state,
      branch: pr.head.ref,
      baseBranch: pr.base.ref,
      headSha: pr.head.sha,
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      updatedAt: now,
    } as const;
    let entity = await this.pullRequests.findOne({
      where: { repositoryId: repository.id, number: pr.number },
      lock: { mode: 'pessimistic_write' },
    });
    if (entity) {
      Object.assign(entity, fields, { version: entity.version + 1 });
      await this.pullRequests.save(entity);
    } else {
      entity = Object.assign(new PullRequestEntity(), {
        id: uuidv7(),
        organizationId: installation.organizationId,
        repositoryId: repository.id,
        number: pr.number,
        createdAt: now,
        version: 1,
        ...fields,
      });
      await this.pullRequests.insert(entity);
    }

    const bot = `${this.config.get('GITHUB_APP_SLUG', { infer: true }) ?? ''}[bot]`;
    await this.events.emit({
      eventType: 'git.pull-request.updated',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: installation.organizationId,
      payload: {
        repositoryId: repository.id,
        repository: repository.fullName,
        number: entity.number,
        url: entity.url,
        state: entity.state,
        branch: entity.branch,
        baseBranch: entity.baseBranch,
        headSha: entity.headSha,
        mergedAt: entity.mergedAt?.toISOString() ?? null,
        fromAetherOs:
          payload.sender?.type === 'Bot' && payload.sender.login === bot,
      },
    });
    return true;
  }
}
