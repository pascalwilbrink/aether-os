import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  mapPage,
  type Page,
  type PageRequest,
  Transactional,
} from '@hephaestus/core';
import { OrganizationsService } from '@hephaestus/tenancy';

import { nextAgentStatus } from './agent-transitions.js';
import { AgentEntity } from './agent.entity.js';
import { AgentArchivedError, AgentNotPublishedError } from './agent.errors.js';
import { AgentMapper } from './agent.mapper.js';
import type { AgentResponse } from './dto/agent.response.js';
import type { CreateAgentRequest } from './dto/create-agent.request.js';

/**
 * Agents. Reads require the organization to exist (404); writes also
 * require it to be active (`ORGANIZATION_SUSPENDED`).
 */
@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
    private readonly mapper: AgentMapper,
    private readonly organizations: OrganizationsService,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateAgentRequest,
  ): Promise<AgentResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    await this.agents.insert(entity);

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<AgentResponse>> {
    await this.organizations.assertExists(organizationId);

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
    await this.organizations.assertExists(organizationId);

    return this.mapper.toResponse(await this.load(organizationId, agentId));
  }

  @Transactional()
  async archive(
    organizationId: string,
    agentId: string,
  ): Promise<AgentResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = await this.load(organizationId, agentId, true);
    const next = nextAgentStatus(entity.status, 'archive');
    if (next !== entity.status) {
      entity.status = next;
      entity.updatedAt = new Date();
      await this.agents.save(entity);
    }

    return this.mapper.toResponse(entity);
  }

  /** For reads of an agent's versions: 404 unless the agent exists. */
  async assertExists(organizationId: string, agentId: string): Promise<void> {
    await this.organizations.assertExists(organizationId);
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
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = await this.load(organizationId, agentId, true);
    if (entity.status !== 'active') {
      throw new AgentArchivedError(agentId);
    }

    return { latestVersionId: entity.latestVersionId };
  }

  /**
   * The agent's published version, to pin a task to: 404 unless the agent
   * exists, `AGENT_ARCHIVED`, or `AGENT_NOT_PUBLISHED` without one.
   */
  async publishedVersion(
    organizationId: string,
    agentId: string,
  ): Promise<string> {
    const entity = await this.load(organizationId, agentId);
    if (entity.status !== 'active') {
      throw new AgentArchivedError(agentId);
    }
    if (!entity.latestVersionId) {
      throw new AgentNotPublishedError(agentId);
    }
    return entity.latestVersionId;
  }

  /** Records the published version; call after `lockForVersionChange`. */
  @Transactional()
  async setLatestVersion(
    organizationId: string,
    agentId: string,
    versionId: string,
  ): Promise<void> {
    await this.agents.update(
      { id: agentId, organizationId },
      { latestVersionId: versionId, updatedAt: new Date() },
    );
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
