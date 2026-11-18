import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import { findPage, mapPage, type Page, type PageRequest } from '@proxenos/core';
import type { GitHubRepository } from '@proxenos/github';

import type { RepositoryResponse } from './dto/repository.response.js';
import type { InstallationEntity } from './installation.entity.js';
import { RepositoryUnavailableError } from './installations.errors.js';
import { RepositoryEntity } from './repository.entity.js';
import { RepositoryMapper } from './repository.mapper.js';

/** A repository as events name it. */
export interface RepositoryRef {
  repositoryId: string;
  fullName: string;
}

/**
 * The repositories installations cover. Kept in step with GitHub by
 * `InstallationsService` (connecting, syncing, webhooks); a repository the
 * installation no longer covers stays, `removed`, so links and history
 * can still name it.
 */
@Injectable()
export class RepositoriesService {
  constructor(
    @InjectRepository(RepositoryEntity)
    private readonly repositories: Repository<RepositoryEntity>,
    private readonly mapper: RepositoryMapper,
  ) {}

  /** The organization's available repositories, by full name. */
  async list(
    organizationId: string,
    filter: { installationId?: string },
    page: PageRequest,
  ): Promise<Page<RepositoryResponse>> {
    const entities = await findPage(
      this.repositories,
      {
        where: {
          organizationId,
          status: 'available',
          ...(filter.installationId
            ? { installationId: filter.installationId }
            : {}),
        },
        sortBy: 'fullName',
        direction: 'ASC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  /** One of the organization's repositories, available or not (404 otherwise). */
  async findById(
    organizationId: string,
    repositoryId: string,
  ): Promise<RepositoryResponse> {
    const entity = await this.repositories.findOneBy({
      id: repositoryId,
      organizationId,
    });
    if (!entity) {
      throw new NotFoundException(`Repository ${repositoryId} not found`);
    }
    return this.mapper.toResponse(entity);
  }

  /** A repository that can be linked or used: `REPOSITORY_UNAVAILABLE` once removed. */
  async findAvailable(
    organizationId: string,
    repositoryId: string,
  ): Promise<RepositoryResponse> {
    const repository = await this.findById(organizationId, repositoryId);
    if (repository.status !== 'available') {
      throw new RepositoryUnavailableError(repositoryId);
    }
    return repository;
  }

  async findByIds(
    organizationId: string,
    repositoryIds: string[],
  ): Promise<RepositoryResponse[]> {
    if (repositoryIds.length === 0) {
      return [];
    }
    const entities = await this.repositories.findBy({
      organizationId,
      id: In(repositoryIds),
    });
    return entities.map((entity) => this.mapper.toResponse(entity));
  }

  /**
   * Brings the installation's repositories in step with what GitHub says it
   * covers (inside the caller's transaction): new ones are added, missing
   * ones `removed`, returning ones `available` again, names and default
   * branches updated. Returns what became available and what was removed.
   */
  async reconcile(
    installation: InstallationEntity,
    covered: GitHubRepository[],
    now: Date,
  ): Promise<{ added: RepositoryRef[]; removed: RepositoryRef[] }> {
    const existing = await this.repositories.findBy({
      installationId: installation.id,
    });
    const byExternalId = new Map(
      existing.map((entity) => [entity.externalId, entity]),
    );
    const added: RepositoryRef[] = [];
    const removed: RepositoryRef[] = [];
    const changed: RepositoryEntity[] = [];

    for (const repository of covered) {
      const entity = byExternalId.get(repository.id);
      byExternalId.delete(repository.id);
      if (!entity) {
        const created = this.mapper.toEntity(installation, repository, now);
        changed.push(created);
        added.push({ repositoryId: created.id, fullName: created.fullName });
        continue;
      }
      const returning = entity.status === 'removed';
      if (
        returning ||
        entity.fullName !== repository.fullName ||
        entity.defaultBranch !== repository.defaultBranch ||
        entity.private !== repository.private
      ) {
        Object.assign(entity, {
          fullName: repository.fullName,
          defaultBranch: repository.defaultBranch,
          private: repository.private,
          status: 'available',
          updatedAt: now,
        });
        changed.push(entity);
        if (returning) {
          added.push({ repositoryId: entity.id, fullName: entity.fullName });
        }
      }
    }
    // Whatever GitHub no longer lists is gone from the installation.
    for (const entity of byExternalId.values()) {
      if (entity.status === 'available') {
        Object.assign(entity, { status: 'removed', updatedAt: now });
        changed.push(entity);
        removed.push({ repositoryId: entity.id, fullName: entity.fullName });
      }
    }
    if (changed.length > 0) {
      await this.repositories.save(changed);
    }
    return { added, removed };
  }
}
