import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { AgentsService } from '@agora/agents';
import {
  AccessControl,
  AgoraEvents,
  type ApiTypes,
  findPage,
  isUniqueViolation,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
} from '@agora/core';

import { configurationProblem } from './council-configuration.js';
import { nextCouncilVersionStatus } from './council-transitions.js';
import { CouncilVersionEntity } from './council-version.entity.js';
import {
  CouncilVersionConflictError,
  CouncilVersionInvalidError,
  InvalidCouncilVersionTransitionError,
} from './council.errors.js';
import { CouncilMapper } from './council.mapper.js';
import { CouncilsService } from './councils.service.js';

/**
 * Immutable council versions, like agent versions: numbering and
 * publishing lock the council row (`CouncilsService.lockForVersionChange`),
 * so numbers are gapless and only one version is published. Its agents are
 * checked when it's created and again when it's published.
 */
@Injectable()
export class CouncilVersionsService {
  constructor(
    @InjectRepository(CouncilVersionEntity)
    private readonly versions: Repository<CouncilVersionEntity>,
    private readonly mapper: CouncilMapper,
    private readonly councils: CouncilsService,
    private readonly agents: AgentsService,
    private readonly access: AccessControl,
    private readonly events: AgoraEvents,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    councilId: string,
    dto: ApiTypes.CreateCouncilVersionRequest,
  ): Promise<ApiTypes.CouncilVersionResponse> {
    await this.councils.lockForVersionChange(organizationId, councilId);
    const current = await this.versions.maximum('version', { councilId });
    const entity = this.mapper.toVersionEntity(
      dto,
      { organizationId, councilId },
      (current ?? 0) + 1,
      this.access.principal().sub,
      new Date(),
    );
    await this.assertValid(organizationId, entity);
    try {
      // TypeORM's insert types don't take jsonb columns typed as interfaces.
      await this.versions.insert(
        entity as Parameters<Repository<CouncilVersionEntity>['insert']>[0],
      );
    } catch (error) {
      // Can't happen while the council is locked; the constraint is the backstop.
      if (isUniqueViolation(error)) {
        throw new CouncilVersionConflictError(councilId, entity.version);
      }
      throw error;
    }
    return this.mapper.toVersionResponse(entity);
  }

  async list(
    organizationId: string,
    councilId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.CouncilVersionResponse>> {
    await this.councils.assertExists(organizationId, councilId);
    const entities = await findPage(
      this.versions,
      { where: { councilId }, sortBy: 'version', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toVersionResponse(entity));
  }

  async findById(
    organizationId: string,
    councilId: string,
    versionId: string,
  ): Promise<ApiTypes.CouncilVersionResponse> {
    await this.councils.assertExists(organizationId, councilId);
    return this.mapper.toVersionResponse(await this.load(councilId, versionId));
  }

  /**
   * Publishes a draft (its agents checked again) and deprecates the
   * previously published version, in one transaction. Publishing the
   * published version returns it unchanged.
   */
  @Transactional()
  async publish(
    organizationId: string,
    councilId: string,
    versionId: string,
  ): Promise<ApiTypes.CouncilVersionResponse> {
    const { latestVersionId } = await this.councils.lockForVersionChange(
      organizationId,
      councilId,
    );
    const version = await this.load(councilId, versionId, true);
    if (version.status === 'published') {
      return this.mapper.toVersionResponse(version);
    }
    const next = nextCouncilVersionStatus(version.status, 'publish');
    if (!next) {
      throw new InvalidCouncilVersionTransitionError(
        version.id,
        version.status,
        'published',
      );
    }
    // An agent may have been archived since the draft was made.
    await this.assertValid(organizationId, version);

    if (latestVersionId) {
      const previous = await this.load(councilId, latestVersionId, true);
      const deprecated = nextCouncilVersionStatus(previous.status, 'deprecate');
      if (deprecated) {
        previous.status = deprecated;
        await this.versions.save(previous);
      }
    }
    version.status = next;
    version.publishedAt = new Date();
    await this.versions.save(version);

    // Hephaestus keeps its copy from these, in this transaction: the whole
    // version (it never changes), then the one it replaced.
    const response = this.mapper.toVersionResponse(version);
    await this.events.emit({
      eventType: 'council-version.published',
      aggregateId: councilId,
      aggregateVersion: await this.councils.recordVersionChange(
        organizationId,
        councilId,
        version.id,
      ),
      organizationId,
      payload: {
        councilId,
        councilVersionId: version.id,
        previousVersionId: latestVersionId,
        version: response,
      },
    });
    if (latestVersionId) {
      await this.events.emit({
        eventType: 'council-version.deprecated',
        aggregateId: councilId,
        aggregateVersion: await this.councils.recordVersionChange(
          organizationId,
          councilId,
        ),
        organizationId,
        payload: { councilId, councilVersionId: latestVersionId },
      });
    }
    return response;
  }

  /** `COUNCIL_VERSION_INVALID` unless its agents and settings fit. */
  private async assertValid(
    organizationId: string,
    version: CouncilVersionEntity,
  ): Promise<void> {
    const agentIds = [
      version.facilitatorAgentId,
      ...version.members.map((member) => member.agentId),
    ];
    const problem = configurationProblem(
      {
        facilitator: { agentId: version.facilitatorAgentId },
        members: version.members,
        settings: version.settings,
      },
      await this.agents.statesOf(organizationId, agentIds),
    );
    if (problem) {
      throw new CouncilVersionInvalidError(problem);
    }
  }

  /** Scoped to the council: another council's version is a 404. */
  private async load(
    councilId: string,
    versionId: string,
    forUpdate = false,
  ): Promise<CouncilVersionEntity> {
    const entity = await this.versions.findOne({
      where: { id: versionId, councilId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Council version ${versionId} not found`);
    }
    return entity;
  }
}
