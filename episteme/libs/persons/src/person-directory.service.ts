import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import type { DomainEvent, PolisEvents } from '@episteme/core';

import { PersonEntity } from './person.entity.js';

/**
 * The persons of Polis who can be stewards, copied from its events
 * (`person.*`). Every write is an upsert guarded by Polis's version, so
 * late, repeated or out-of-order events never move a copy back.
 */
@Injectable()
export class PersonDirectory {
  constructor(
    @InjectRepository(PersonEntity)
    private readonly persons: Repository<PersonEntity>,
  ) {}

  /** Of these persons, the ones the organization doesn't have (active). */
  async unknown(
    organizationId: string,
    ids: readonly string[],
  ): Promise<string[]> {
    const distinct = [...new Set(ids)];
    if (distinct.length === 0) return [];
    const found = await this.persons.findBy({
      organizationId,
      id: In(distinct),
      status: 'active',
    });
    const known = new Set(found.map((person) => person.id));
    return distinct.filter((id) => !known.has(id));
  }

  /** The active persons of the organization linked to this user (usually one). */
  async personsOfUser(
    organizationId: string,
    userId: string,
  ): Promise<string[]> {
    const found = await this.persons.findBy({
      organizationId,
      userId,
      status: 'active',
    });
    return found.map((person) => person.id);
  }

  /** `person.created` and `.updated`. */
  async recordPerson(
    event: DomainEvent<PolisEvents.PersonCreated | PolisEvents.PersonUpdated>,
  ): Promise<void> {
    await this.upsert(event, event.payload.personId, {
      userId: event.payload.userId,
      status: 'active',
    });
  }

  /** `person.deleted`. */
  async deletePerson(
    event: DomainEvent<PolisEvents.PersonDeleted>,
  ): Promise<void> {
    await this.upsert(event, event.payload.personId, {
      userId: null,
      status: 'deleted',
    });
  }

  private async upsert(
    event: DomainEvent<unknown>,
    personId: string,
    values: Pick<PersonEntity, 'userId' | 'status'>,
  ): Promise<void> {
    if (!event.organizationId) {
      throw new Error(`Event ${event.eventId} has no organization`);
    }
    await this.persons
      .createQueryBuilder('copy')
      .insert()
      .values({
        id: personId,
        organizationId: event.organizationId,
        ...values,
        version: event.aggregateVersion,
        receivedAt: new Date(),
      })
      .orUpdate(['user_id', 'status', 'version', 'received_at'], ['id'], {
        overwriteCondition: { where: 'copy.version < EXCLUDED.version' },
      })
      .execute();
  }
}
