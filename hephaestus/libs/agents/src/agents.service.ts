import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  type AgoraEvents,
  type DomainEvent,
  OnDomainEvent,
  Transactional,
} from '@hephaestus/core';

import { AgentVersionsService } from './agent-versions.service.js';
import { AgentEntity } from './agent.entity.js';
import {
  AgentArchivedError,
  AgentNotCopiedYetError,
  AgentNotPublishedError,
} from './agent.errors.js';
import { AgentMapper } from './agent.mapper.js';

/**
 * Agents belong to Agora: Hephaestus keeps a copy of them and their
 * published versions from Agora's events (`agora.events`), to pin a
 * version on new tasks and to scope per-agent keys and budgets. Every
 * change is guarded by the agent's `version` (the events'
 * `aggregateVersion`), so a late or repeated event never moves it back.
 */
@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
    private readonly mapper: AgentMapper,
    private readonly versions: AgentVersionsService,
  ) {}

  /** 404 unless the organization has this agent (in the copy). */
  async assertExists(organizationId: string, agentId: string): Promise<void> {
    if (!(await this.agents.existsBy({ id: agentId, organizationId }))) {
      throw this.notFound(agentId);
    }
  }

  /**
   * The agent's published version, to pin a task to: 404 unless the agent
   * exists, `AGENT_ARCHIVED`, or `AGENT_NOT_PUBLISHED` without one.
   */
  async publishedVersion(
    organizationId: string,
    agentId: string,
  ): Promise<string> {
    const entity = await this.agents.findOneBy({ id: agentId, organizationId });
    if (!entity) {
      throw this.notFound(agentId);
    }
    if (entity.status !== 'active') {
      throw new AgentArchivedError(agentId);
    }
    if (!entity.latestVersionId) {
      throw new AgentNotPublishedError(agentId);
    }

    return entity.latestVersionId;
  }

  @OnDomainEvent('agora.agent.created')
  @Transactional()
  async onCreated(event: DomainEvent<AgoraEvents.AgentCreated>): Promise<void> {
    await this.agents
      .createQueryBuilder()
      .insert()
      .values(
        this.mapper.fromCreated(
          event.payload,
          organizationOf(event),
          event.aggregateVersion,
        ),
      )
      .orIgnore()
      .execute();
  }

  @OnDomainEvent('agora.agent.archived')
  @Transactional()
  async onArchived(
    event: DomainEvent<AgoraEvents.AgentArchived>,
  ): Promise<void> {
    const agent = await this.lockForEvent(event);
    if (agent) {
      agent.status = 'archived';
      await this.save(agent, event);
    }
  }

  /**
   * Stores the version (whole, from the event) and makes it the agent's
   * published one, unless a newer event got there first: then it's kept as
   * deprecated, for any task that pinned it.
   */
  @OnDomainEvent('agora.agent-version.published')
  @Transactional()
  async onVersionPublished(
    event: DomainEvent<AgoraEvents.AgentVersionPublished>,
  ): Promise<void> {
    const agent = await this.lockForEvent(event);
    await this.versions.store(
      event.payload.version,
      agent ? 'published' : 'deprecated',
    );
    if (agent) {
      agent.latestVersionId = event.payload.agentVersionId;
      await this.save(agent, event);
    }
  }

  @OnDomainEvent('agora.agent-version.deprecated')
  @Transactional()
  async onVersionDeprecated(
    event: DomainEvent<AgoraEvents.AgentVersionDeprecated>,
  ): Promise<void> {
    // Deprecated is final, so this applies even when it arrives late.
    await this.versions.deprecate(event.payload.agentVersionId);
    const agent = await this.lockForEvent(event);
    if (agent) {
      await this.save(agent, event);
    }
  }

  /**
   * The agent, locked, if the event is newer than the copy; null when it
   * isn't (applied already, or older). An agent the copy doesn't have yet
   * throws, so the consumer retries once `agent.created` is in.
   */
  private async lockForEvent(
    event: DomainEvent<{ agentId: string }>,
  ): Promise<AgentEntity | null> {
    const agent = await this.agents.findOne({
      where: {
        id: event.payload.agentId,
        organizationId: organizationOf(event),
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!agent) {
      throw new AgentNotCopiedYetError(event.payload.agentId);
    }
    if (event.aggregateVersion <= agent.version) {
      return null;
    }

    return agent;
  }

  private async save(
    agent: AgentEntity,
    event: DomainEvent<unknown>,
  ): Promise<void> {
    agent.version = event.aggregateVersion;
    agent.updatedAt = event.occurredAt;
    await this.agents.save(agent);
  }

  private notFound(agentId: string): NotFoundException {
    return new NotFoundException(`Agent ${agentId} not found`);
  }
}

/** Agora's events always belong to an organization. */
function organizationOf(event: DomainEvent<unknown>): string {
  if (!event.organizationId) {
    throw new Error(`Agora event ${event.eventId} has no organization`);
  }
  return event.organizationId;
}
