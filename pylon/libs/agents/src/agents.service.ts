import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  type AgoraEvents,
  type DomainEvent,
  OnDomainEvent,
  Transactional,
} from '@pylon/core';

import { AgentEntity } from './agent.entity.js';

/** An event about an agent the copy doesn't have yet: the consumer retries it. */
export class AgentNotCopiedYetError extends Error {
  constructor(agentId: string) {
    super(`Agent ${agentId} isn't in Pylon's copy yet`);
    this.name = 'AgentNotCopiedYetError';
  }
}

/**
 * Agents belong to Agora: Pylon keeps a copy of which organization has
 * which agent, from Agora's events (`agora.events`), to scope agents' own
 * keys and budgets. Every change is guarded by the agent's `version` (the
 * events' `aggregateVersion`), so a late or repeated event never moves it
 * back. Pylon never calls Agora (Agora asks Pylon about models).
 */
@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
  ) {}

  /** 404 unless the organization has this agent (archived ones included). */
  async assertExists(organizationId: string, agentId: string): Promise<void> {
    if (!(await this.agents.existsBy({ id: agentId, organizationId }))) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
  }

  @OnDomainEvent('agora.agent.created')
  @Transactional()
  async onCreated(event: DomainEvent<AgoraEvents.AgentCreated>): Promise<void> {
    const at = new Date(event.occurredAt);
    await this.agents
      .createQueryBuilder()
      .insert()
      .values({
        id: event.payload.agentId,
        organizationId: organizationOf(event),
        status: 'active',
        version: event.aggregateVersion,
        createdAt: at,
        updatedAt: at,
      })
      .orIgnore()
      .execute();
  }

  @OnDomainEvent('agora.agent.archived')
  @Transactional()
  async onArchived(
    event: DomainEvent<AgoraEvents.AgentArchived>,
  ): Promise<void> {
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
      return;
    }
    agent.status = 'archived';
    agent.version = event.aggregateVersion;
    agent.updatedAt = new Date(event.occurredAt);
    await this.agents.save(agent);
  }
}

/** Agora's events always belong to an organization. */
function organizationOf(event: DomainEvent<unknown>): string {
  if (!event.organizationId) {
    throw new Error(`Agora event ${event.eventId} has no organization`);
  }
  return event.organizationId;
}
