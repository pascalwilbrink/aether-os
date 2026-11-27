import { Injectable } from '@nestjs/common';

import {
  OnDomainEvent,
  type DomainEvent,
  type PolisEvents,
} from '@episteme/core';

import { PersonDirectory } from './person-directory.service.js';

/**
 * Keeps the persons who can be stewards in step with Polis. A deleted
 * person stays a steward where they were one (ownership when someone leaves
 * is open question 4); they can't be named again.
 */
@Injectable()
export class PersonEventsListener {
  constructor(private readonly persons: PersonDirectory) {}

  @OnDomainEvent('polis.person.created')
  async onCreated(
    event: DomainEvent<PolisEvents.PersonCreated>,
  ): Promise<void> {
    await this.persons.recordPerson(event);
  }

  @OnDomainEvent('polis.person.updated')
  async onUpdated(
    event: DomainEvent<PolisEvents.PersonUpdated>,
  ): Promise<void> {
    await this.persons.recordPerson(event);
  }

  @OnDomainEvent('polis.person.deleted')
  async onDeleted(
    event: DomainEvent<PolisEvents.PersonDeleted>,
  ): Promise<void> {
    await this.persons.deletePerson(event);
  }
}
