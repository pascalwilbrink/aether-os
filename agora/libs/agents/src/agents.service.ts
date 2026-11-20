import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  AgoraEvents,
  findPage,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
} from '@agora/core';
import { TenancyService } from '@agora/tenancy';

import { nextAgentStatus } from './agent-transitions.js';
import { AgentEntity } from './agent.entity.js';
import { AgentArchivedError } from './agent.errors.js';
import { AgentMapper } from './agent.mapper.js';
import type { AgentResponse } from './dto/agent.response.js';
import type { CreateAgentRequest } from './dto/create-agent.request.js';

/**
 * Agents. Writes need an organization Polis says is active (404 for an
 * unknown one, `ORGANIZATION_SUSPENDED`); reads only the token's
 * organization (Krepis). Every change bumps the agent's `version` and
 * publishes an event in its transaction (`agent.created`,
 * `agent.archived`, and the version events through `AgentVersionsService`).
 */
@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
    private readonly mapper: AgentMapper,
    private readonly tenancy: TenancyService,
    private readonly access: AccessControl,
    private readonly events: AgoraEvents,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateAgentRequest,
  ): Promise<AgentResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    await this.agents.insert(entity);
    await this.events.emit({
      eventType: 'agent.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: {
        agentId: entity.id,
        name: entity.name,
        description: entity.description,
        createdBy: entity.createdBy,
        createdAt: entity.createdAt.toISOString(),
      },
    });

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<AgentResponse>> {
    const entities = await findPage(
      this.agents,
      { where: { organizationId }, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    agentId: string,
  ): Promise<AgentResponse> {
    return this.mapper.toResponse(await this.load(organizationId, agentId));
  }

  @Transactional()
  async archive(
    organizationId: string,
    agentId: string,
  ): Promise<AgentResponse> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, agentId, true);
    const next = nextAgentStatus(entity.status, 'archive');
    if (next !== entity.status) {
      entity.status = next;
      entity.version += 1;
      entity.updatedAt = new Date();
      await this.agents.save(entity);
      await this.events.emit({
        eventType: 'agent.archived',
        aggregateId: entity.id,
        aggregateVersion: entity.version,
        organizationId,
        payload: { agentId: entity.id },
      });
    }

    return this.mapper.toResponse(entity);
  }

  /** For reads of an agent's versions: 404 unless the agent exists. */
  async assertExists(organizationId: string, agentId: string): Promise<void> {
    if (!(await this.agents.existsBy({ id: agentId, organizationId }))) {
      throw this.notFound(agentId);
    }
  }

  /**
   * For changes to an agent's versions: the organization must accept writes
   * and the agent must be active (`AGENT_ARCHIVED`). Locks the agent row
   * until the caller's transaction ends, which serializes version numbering
   * and publishing per agent. Returns the currently published version.
   */
  @Transactional()
  async lockForVersionChange(
    organizationId: string,
    agentId: string,
  ): Promise<{ latestVersionId: string | null }> {
    await this.tenancy.assertOrganizationAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, agentId, true);
    if (entity.status !== 'active') {
      throw new AgentArchivedError(agentId);
    }

    return { latestVersionId: entity.latestVersionId };
  }

  /**
   * Bumps the agent's version for one change to its versions, recording
   * the published one if given; call after `lockForVersionChange`. Returns
   * the new version: the change's event's `aggregateVersion`.
   */
  @Transactional()
  async recordVersionChange(
    organizationId: string,
    agentId: string,
    latestVersionId?: string,
  ): Promise<number> {
    const entity = await this.load(organizationId, agentId, true);
    if (latestVersionId !== undefined) {
      entity.latestVersionId = latestVersionId;
    }
    entity.version += 1;
    entity.updatedAt = new Date();
    await this.agents.save(entity);

    return entity.version;
  }

  /** Scoped to the organization: another organization's agent is a 404. */
  private async load(
    organizationId: string,
    agentId: string,
    forUpdate = false,
  ): Promise<AgentEntity> {
    const entity = await this.agents.findOne({
      where: { id: agentId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw this.notFound(agentId);
    }

    return entity;
  }

  private notFound(agentId: string): NotFoundException {
    return new NotFoundException(`Agent ${agentId} not found`);
  }
}
