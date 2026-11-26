import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import type { AgoraEvents, DomainEvent, PolisEvents } from '@ergon/core';

import { AgentEntity } from './agent.entity.js';
import { AgentArchivedError, UnknownAssigneeError } from './assignee.errors.js';
import { PersonEntity } from './person.entity.js';

export type AssigneeKind = 'person' | 'agent';

/**
 * The persons (Polis) and agents (Agora) work can be assigned to, copied
 * from their events. Every write is an upsert guarded by the owner's
 * version, so late, repeated or out-of-order events never move a copy back.
 */
@Injectable()
export class AssigneeDirectory {
  constructor(
    @InjectRepository(PersonEntity)
    private readonly persons: Repository<PersonEntity>,
    @InjectRepository(AgentEntity)
    private readonly agents: Repository<AgentEntity>,
  ) {}

  /** `UNKNOWN_ASSIGNEE` unless the organization has them; `AGENT_ARCHIVED`. */
  async assertAssignable(
    organizationId: string,
    kind: AssigneeKind,
    id: string,
  ): Promise<void> {
    if (kind === 'person') {
      const person = await this.persons.findOneBy({ id, organizationId });
      if (!person || person.status !== 'active') {
        throw new UnknownAssigneeError(kind, id);
      }
      return;
    }
    const agent = await this.agents.findOneBy({ id, organizationId });
    if (!agent) {
      throw new UnknownAssigneeError(kind, id);
    }
    if (agent.status !== 'active') {
      throw new AgentArchivedError(id);
    }
  }

  /** `person.created` and `.updated`. */
  async recordPerson(
    event: DomainEvent<PolisEvents.PersonCreated | PolisEvents.PersonUpdated>,
  ): Promise<void> {
    await this.upsertPerson(event, event.payload.personId, {
      userId: event.payload.userId,
      status: 'active',
    });
  }

  /** `person.deleted`; true when this event deleted them. */
  async deletePerson(
    event: DomainEvent<PolisEvents.PersonDeleted>,
  ): Promise<boolean> {
    return this.upsertPerson(event, event.payload.personId, {
      userId: null,
      status: 'deleted',
    });
  }

  /** `agent.created`. */
  async recordAgent(
    event: DomainEvent<AgoraEvents.AgentCreated>,
  ): Promise<void> {
    await this.agents
      .createQueryBuilder('copy')
      .insert()
      .values({
        id: event.payload.agentId,
        organizationId: organizationOf(event),
        name: event.payload.name,
        status: 'active',
        version: event.aggregateVersion,
        receivedAt: new Date(),
      })
      .orUpdate(['name', 'version', 'received_at'], ['id'], {
        overwriteCondition: { where: 'copy.version < EXCLUDED.version' },
      })
      .execute();
  }

  /** `agent.archived`; true when this event archived it. */
  async archiveAgent(
    event: DomainEvent<AgoraEvents.AgentArchived>,
  ): Promise<boolean> {
    const result = await this.agents
      .createQueryBuilder('copy')
      .insert()
      .values({
        id: event.payload.agentId,
        organizationId: organizationOf(event),
        name: '',
        status: 'archived',
        version: event.aggregateVersion,
        receivedAt: new Date(),
      })
      .orUpdate(['status', 'version', 'received_at'], ['id'], {
        overwriteCondition: { where: 'copy.version < EXCLUDED.version' },
      })
      .returning(['id'])
      .execute();
    return result.raw.length > 0;
  }

  /** Whether the row was written (false when a newer version was there). */
  private async upsertPerson(
    event: DomainEvent<unknown>,
    personId: string,
    values: Pick<PersonEntity, 'userId' | 'status'>,
  ): Promise<boolean> {
    const result = await this.persons
      .createQueryBuilder('copy')
      .insert()
      .values({
        id: personId,
        organizationId: organizationOf(event),
        ...values,
        version: event.aggregateVersion,
        receivedAt: new Date(),
      })
      .orUpdate(['user_id', 'status', 'version', 'received_at'], ['id'], {
        overwriteCondition: { where: 'copy.version < EXCLUDED.version' },
      })
      .returning(['id'])
      .execute();
    return result.raw.length > 0;
  }
}

/** The organization a person's or agent's event belongs to. */
export function organizationOf(event: DomainEvent<unknown>): string {
  if (!event.organizationId) {
    throw new Error(`Event ${event.eventId} has no organization`);
  }
  return event.organizationId;
}
