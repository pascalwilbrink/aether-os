import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
} from '@hephaestus/core';

import { nextAgentVersionStatus } from './agent-transitions.js';
import { AgentVersionEntity } from './agent-version.entity.js';
import { AgentVersionMapper } from './agent-version.mapper.js';
import {
  AgentVersionConflictError,
  InvalidAgentVersionTransitionError,
} from './agent.errors.js';
import { AgentsService } from './agents.service.js';
import type { AgentVersionResponse } from './dto/agent-version.response.js';
import type { CreateAgentVersionRequest } from './dto/create-agent-version.request.js';

/**
 * Immutable agent versions. Numbering and publishing lock the agent row
 * (`AgentsService.lockForVersionChange`), so concurrent requests for one
 * agent take turns: numbers are gapless and only one version is published.
 */
@Injectable()
export class AgentVersionsService {
  constructor(
    @InjectRepository(AgentVersionEntity)
    private readonly versions: Repository<AgentVersionEntity>,
    private readonly mapper: AgentVersionMapper,
    private readonly agents: AgentsService,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    agentId: string,
    dto: CreateAgentVersionRequest,
  ): Promise<AgentVersionResponse> {
    await this.agents.lockForVersionChange(organizationId, agentId);

    const current = await this.versions.maximum('version', { agentId });
    const entity = this.mapper.toEntity(
      dto,
      { organizationId, agentId },
      (current ?? 0) + 1,
      this.access.principal().sub,
      new Date(),
    );
    try {
      // TypeORM's insert types don't take jsonb columns typed as interfaces.
      await this.versions.insert(
        entity as Parameters<Repository<AgentVersionEntity>['insert']>[0],
      );
    } catch (error) {
      // Can't happen while the agent is locked; the constraint is the backstop.
      if (isUniqueViolation(error)) {
        throw new AgentVersionConflictError(agentId, entity.version);
      }
      throw error;
    }

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    agentId: string,
    page: PageRequest,
  ): Promise<Page<AgentVersionResponse>> {
    // 404 for an unknown agent rather than an empty page.
    await this.agents.assertExists(organizationId, agentId);

    const entities = await findPage(
      this.versions,
      { where: { agentId }, sortBy: 'version', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    agentId: string,
    versionId: string,
  ): Promise<AgentVersionResponse> {
    await this.agents.assertExists(organizationId, agentId);

    return this.mapper.toResponse(await this.load(agentId, versionId));
  }

  /**
   * Publishes a draft and deprecates the previously published version, in
   * one transaction. Publishing the published version returns it unchanged.
   */
  @Transactional()
  async publish(
    organizationId: string,
    agentId: string,
    versionId: string,
  ): Promise<AgentVersionResponse> {
    const { latestVersionId } = await this.agents.lockForVersionChange(
      organizationId,
      agentId,
    );
    const version = await this.load(agentId, versionId, true);
    if (version.status === 'published') {
      return this.mapper.toResponse(version);
    }

    const next = nextAgentVersionStatus(version.status, 'publish');
    if (!next) {
      throw new InvalidAgentVersionTransitionError(
        version.id,
        version.status,
        'published',
      );
    }
    const now = new Date();

    // Only one version is live at a time: retire the one being replaced.
    if (latestVersionId) {
      const previous = await this.load(agentId, latestVersionId, true);
      const deprecated = nextAgentVersionStatus(previous.status, 'deprecate');
      if (deprecated) {
        previous.status = deprecated;
        await this.versions.save(previous);
      }
    }

    version.status = next;
    version.publishedAt = now;
    await this.versions.save(version);
    await this.agents.setLatestVersion(organizationId, agentId, version.id);

    return this.mapper.toResponse(version);
  }

  /** Scoped to the agent: another agent's version is a 404. */
  private async load(
    agentId: string,
    versionId: string,
    forUpdate = false,
  ): Promise<AgentVersionEntity> {
    const entity = await this.versions.findOne({
      where: { id: versionId, agentId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Agent version ${versionId} not found`);
    }

    return entity;
  }
}
