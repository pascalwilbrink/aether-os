import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  OnDomainEvent,
  ProxenosEvents,
  Transactional,
  type DomainEvent,
  type Page,
  type PageRequest,
  type ProxenosEventPayloads,
} from '@proxenos/core';
import {
  InstallationsService,
  RepositoriesService,
} from '@proxenos/installations';
import { TenancyService } from '@proxenos/tenancy';

import type { LinkRepositoryRequest } from './dto/link-repository.request.js';
import type { RepositoryLinkResponse } from './dto/repository-link.response.js';
import { RepositoryLinkEntity } from './repository-link.entity.js';
import { RepositoryLinkMapper } from './repository-link.mapper.js';
import { RepositoryAlreadyLinkedError } from './repository-links.errors.js';

/**
 * Which repositories a project works in (docs/git.md: a project admin links
 * repositories its organization's installations cover). A link goes away
 * with its repository: when the installation loses it, in the same
 * transaction as `git.installation-changed`.
 */
@Injectable()
export class RepositoryLinksService {
  constructor(
    @InjectRepository(RepositoryLinkEntity)
    private readonly links: Repository<RepositoryLinkEntity>,
    private readonly mapper: RepositoryLinkMapper,
    private readonly repositories: RepositoriesService,
    private readonly installations: InstallationsService,
    private readonly tenancy: TenancyService,
    private readonly events: ProxenosEvents,
    private readonly access: AccessControl,
  ) {}

  /** The projects a repository is linked to (no caller: webhooks). */
  async projectsOf(repositoryId: string): Promise<string[]> {
    return (await this.linksOf(repositoryId)).map((link) => link.projectId);
  }

  /** The repository's links: each project it's linked to, with the link's ID. */
  async linksOf(
    repositoryId: string,
  ): Promise<{ projectId: string; linkId: string }[]> {
    const links = await this.links.find({
      where: { repositoryId },
      order: { createdAt: 'ASC' },
    });
    return links.map((link) => ({
      projectId: link.projectId,
      linkId: link.id,
    }));
  }

  /** Links an available repository of an active installation (`project:manage`). */
  @Transactional()
  async link(
    organizationId: string,
    projectId: string,
    body: LinkRepositoryRequest,
  ): Promise<RepositoryLinkResponse> {
    await this.tenancy.assertProjectAcceptsWrites(organizationId, projectId);
    const repository = await this.repositories.findAvailable(
      organizationId,
      body.repositoryId,
    );
    await this.installations.findActive(
      organizationId,
      repository.installationId,
    );
    const entity = this.mapper.toEntity(
      organizationId,
      projectId,
      repository.id,
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.links.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new RepositoryAlreadyLinkedError(repository.id, projectId);
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'git.repository-linked',
      aggregateId: entity.id,
      aggregateVersion: 1,
      organizationId,
      projectId,
      payload: {
        linkId: entity.id,
        projectId,
        repositoryId: repository.id,
        fullName: repository.fullName,
      },
    });
    return this.mapper.toResponse(entity, repository);
  }

  /** The project's links, oldest first, each with its repository. */
  async list(
    organizationId: string,
    projectId: string,
    page: PageRequest,
  ): Promise<Page<RepositoryLinkResponse>> {
    const entities = await findPage(
      this.links,
      {
        where: { organizationId, projectId },
        sortBy: 'createdAt',
        direction: 'ASC',
      },
      page,
    );
    const repositories = new Map(
      (
        await this.repositories.findByIds(
          organizationId,
          entities.items.map((entity) => entity.repositoryId),
        )
      ).map((repository) => [repository.id, repository]),
    );
    return {
      items: entities.items.flatMap((entity) => {
        const repository = repositories.get(entity.repositoryId);
        return repository ? [this.mapper.toResponse(entity, repository)] : [];
      }),
      nextCursor: entities.nextCursor,
    };
  }

  async findById(
    organizationId: string,
    projectId: string,
    linkId: string,
  ): Promise<RepositoryLinkResponse> {
    const entity = await this.load(organizationId, projectId, linkId);
    const repository = await this.repositories.findById(
      organizationId,
      entity.repositoryId,
    );
    return this.mapper.toResponse(entity, repository);
  }

  /** Removes a link (`project:manage`); an archived project can still drop its links. */
  @Transactional()
  async unlink(
    organizationId: string,
    projectId: string,
    linkId: string,
  ): Promise<void> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const link = await this.findById(organizationId, projectId, linkId);
    await this.links.delete({ id: linkId });
    await this.emitUnlinked(
      organizationId,
      {
        id: link.id,
        projectId: link.projectId,
        repositoryId: link.repository.id,
        fullName: link.repository.fullName,
      },
      'unlinked',
    );
  }

  /** The installation lost repositories: their links go too, in the same transaction. */
  @OnDomainEvent('proxenos.git.installation-changed')
  async onInstallationChanged(
    event: DomainEvent<ProxenosEventPayloads['git.installation-changed']>,
  ): Promise<void> {
    const removed = event.payload.repositoriesRemoved;
    if (removed.length === 0) {
      return;
    }
    const names = new Map(
      removed.map((ref) => [ref.repositoryId, ref.fullName]),
    );
    const links = await this.links.findBy({
      repositoryId: In([...names.keys()]),
    });
    if (links.length === 0) {
      return;
    }
    await this.links.delete({ id: In(links.map((link) => link.id)) });
    for (const link of links) {
      await this.emitUnlinked(
        link.organizationId,
        {
          id: link.id,
          projectId: link.projectId,
          repositoryId: link.repositoryId,
          fullName: names.get(link.repositoryId) ?? '',
        },
        'repository-removed',
      );
    }
  }

  private emitUnlinked(
    organizationId: string,
    link: {
      id: string;
      projectId: string;
      repositoryId: string;
      fullName: string;
    },
    reason: 'unlinked' | 'repository-removed',
  ) {
    return this.events.emit({
      eventType: 'git.repository-unlinked',
      aggregateId: link.id,
      // A link is created (1) and removed (2), nothing in between.
      aggregateVersion: 2,
      organizationId,
      projectId: link.projectId,
      payload: {
        linkId: link.id,
        projectId: link.projectId,
        repositoryId: link.repositoryId,
        fullName: link.fullName,
        reason,
      },
    });
  }

  private async load(
    organizationId: string,
    projectId: string,
    linkId: string,
  ): Promise<RepositoryLinkEntity> {
    const entity = await this.links.findOneBy({
      id: linkId,
      organizationId,
      projectId,
    });
    if (!entity) {
      throw new NotFoundException(`Repository link ${linkId} not found`);
    }
    return entity;
  }
}
