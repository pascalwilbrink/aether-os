import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  ProxenosEvents,
  Transactional,
  type Page,
  type PageRequest,
} from '@proxenos/core';
import {
  GitHubApp,
  type GitHubInstallation,
  type GitHubRepository,
} from '@proxenos/github';
import { TenancyService } from '@proxenos/tenancy';

import type { InstallationResponse } from './dto/installation.response.js';
import { InstallationEntity } from './installation.entity.js';
import { InstallationMapper } from './installation.mapper.js';
import { InstallationNotActiveError } from './installations.errors.js';
import {
  RepositoriesService,
  type RepositoryRef,
} from './repositories.service.js';

/** The installation already belongs to another organization (docs/git.md: exactly one). */
export class InstallationTakenError extends Error {
  constructor(externalId: string) {
    super(`GitHub installation ${externalId} belongs to another organization`);
    this.name = 'InstallationTakenError';
  }
}

/** What GitHub currently says about an installation; null: uninstalled. */
type GitHubState = {
  installation: GitHubInstallation;
  repositories: GitHubRepository[];
} | null;

/**
 * The organizations' GitHub App installations, kept in step with GitHub:
 * on connecting, on a sync, and from webhooks. Every change that matters to
 * others (status, repositories added or removed) bumps `version` and
 * publishes `git.installation-changed` in the same transaction; links of
 * removed repositories go with it (`RepositoryLinksService`, on the local
 * event).
 */
@Injectable()
export class InstallationsService {
  constructor(
    @InjectRepository(InstallationEntity)
    private readonly installations: Repository<InstallationEntity>,
    private readonly mapper: InstallationMapper,
    private readonly repositories: RepositoriesService,
    private readonly github: GitHubApp,
    private readonly tenancy: TenancyService,
    private readonly events: ProxenosEvents,
  ) {}

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<InstallationResponse>> {
    const entities = await findPage(
      this.installations,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    installationId: string,
  ): Promise<InstallationResponse> {
    return this.mapper.toResponse(
      await this.load(organizationId, installationId),
    );
  }

  /** An installation repositories can be used through: `INSTALLATION_NOT_ACTIVE` otherwise. */
  async findActive(
    organizationId: string,
    installationId: string,
  ): Promise<InstallationResponse> {
    const installation = await this.findById(organizationId, installationId);
    if (installation.status !== 'active') {
      throw new InstallationNotActiveError(installationId);
    }
    return installation;
  }

  /**
   * Records an installation someone just connected (GitHub's setup
   * callback), with what GitHub says it covers. Connecting it again in the
   * same organization refreshes it; another organization's is refused.
   */
  @Transactional()
  async connect(
    organizationId: string,
    createdBy: string,
    installation: GitHubInstallation,
    repositories: GitHubRepository[],
  ): Promise<InstallationResponse> {
    const now = new Date();
    const existing = await this.installations.findOne({
      where: { provider: 'github', externalId: installation.id },
      lock: { mode: 'pessimistic_write' },
    });
    if (existing && existing.organizationId !== organizationId) {
      throw new InstallationTakenError(installation.id);
    }
    if (existing) {
      return this.mapper.toResponse(
        await this.apply(existing, { installation, repositories }, now),
      );
    }
    const entity = this.mapper.toEntity(
      organizationId,
      installation,
      createdBy,
      now,
    );
    await this.installations.insert(entity);
    const { added } = await this.repositories.reconcile(
      entity,
      repositories,
      now,
    );
    await this.emitChanged(entity, added, []);
    return this.mapper.toResponse(entity);
  }

  /** Reads the installation from GitHub again (`org:manage`), as a webhook would have. */
  async sync(
    organizationId: string,
    installationId: string,
  ): Promise<InstallationResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, installationId);
    const state = await this.fetch(entity.externalId);
    return this.mapper.toResponse(await this.applyById(entity.id, state));
  }

  /**
   * Webhooks: the installation with GitHub's ID changed (repositories
   * added or removed, unsuspended, …): read it again. False when no
   * organization connected it.
   */
  async syncByExternalId(externalId: string): Promise<boolean> {
    const entity = await this.installations.findOneBy({
      provider: 'github',
      externalId,
    });
    if (!entity) {
      return false;
    }
    await this.applyById(entity.id, await this.fetch(externalId));
    return true;
  }

  /** Webhooks: uninstalled. Its repositories are removed (and their links with them). */
  async deleteByExternalId(externalId: string): Promise<boolean> {
    const entity = await this.installations.findOneBy({
      provider: 'github',
      externalId,
    });
    if (!entity) {
      return false;
    }
    await this.applyById(entity.id, null);
    return true;
  }

  /** Webhooks: suspended on GitHub (no tokens until unsuspended). */
  @Transactional()
  async suspendByExternalId(externalId: string): Promise<boolean> {
    const entity = await this.installations.findOne({
      where: { provider: 'github', externalId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) {
      return false;
    }
    if (entity.status === 'active') {
      this.touch(entity, new Date());
      entity.status = 'suspended';
      await this.installations.save(entity);
      await this.emitChanged(entity, [], []);
    }
    return true;
  }

  private async fetch(externalId: string): Promise<GitHubState> {
    const installation = await this.github.installation(externalId);
    if (!installation) {
      return null;
    }
    return {
      installation,
      repositories: await this.github.repositories(externalId),
    };
  }

  /** GitHub is asked first, outside the transaction; this applies what it said. */
  @Transactional()
  private async applyById(
    id: string,
    state: GitHubState,
  ): Promise<InstallationEntity> {
    const entity = await this.installations.findOneOrFail({
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    return this.apply(entity, state, new Date());
  }

  private async apply(
    entity: InstallationEntity,
    state: GitHubState,
    now: Date,
  ): Promise<InstallationEntity> {
    const before = {
      status: entity.status,
      accountLogin: entity.accountLogin,
      repositorySelection: entity.repositorySelection,
    };
    let added: RepositoryRef[] = [];
    let removed: RepositoryRef[] = [];
    if (state) {
      entity.status = state.installation.suspended ? 'suspended' : 'active';
      entity.accountLogin = state.installation.account.login;
      entity.accountType = state.installation.account.type;
      entity.repositorySelection = state.installation.repositorySelection;
      ({ added, removed } = await this.repositories.reconcile(
        entity,
        state.repositories,
        now,
      ));
    } else {
      entity.status = 'deleted';
      ({ removed } = await this.repositories.reconcile(entity, [], now));
    }
    const changed =
      added.length > 0 ||
      removed.length > 0 ||
      before.status !== entity.status ||
      before.accountLogin !== entity.accountLogin ||
      before.repositorySelection !== entity.repositorySelection;
    if (changed) {
      this.touch(entity, now);
      await this.installations.save(entity);
      await this.emitChanged(entity, added, removed);
    }
    return entity;
  }

  private touch(entity: InstallationEntity, now: Date): void {
    entity.updatedAt = now;
    entity.version += 1;
  }

  private emitChanged(
    entity: InstallationEntity,
    added: RepositoryRef[],
    removed: RepositoryRef[],
  ) {
    return this.events.emit({
      eventType: 'git.installation-changed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      payload: {
        installationId: entity.id,
        provider: entity.provider,
        externalId: entity.externalId,
        account: entity.accountLogin,
        status: entity.status,
        repositoriesAdded: added,
        repositoriesRemoved: removed,
      },
    });
  }

  private async load(
    organizationId: string,
    installationId: string,
  ): Promise<InstallationEntity> {
    const entity = await this.installations.findOneBy({
      id: installationId,
      organizationId,
    });
    if (!entity) {
      throw new NotFoundException(`Installation ${installationId} not found`);
    }
    return entity;
  }
}
