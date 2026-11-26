import { Injectable } from '@nestjs/common';

import { AssigneeDirectory, organizationOf } from '@ergon/assignees';
import {
  OnDomainEvent,
  Transactional,
  type AgoraEvents,
  type DomainEvent,
  type PolisEvents,
} from '@ergon/core';

import { WorkAssignmentsService } from './work-assignments.service.js';

/**
 * Keeps the persons and agents work can be assigned to in step with Polis
 * and Agora, and ends the assignments of a person who was deleted or an
 * agent that was archived (in the same transaction as the copy).
 */
@Injectable()
export class AssigneeEventsListener {
  constructor(
    private readonly directory: AssigneeDirectory,
    private readonly assignments: WorkAssignmentsService,
  ) {}

  @OnDomainEvent('polis.person.created')
  @Transactional()
  async onPersonCreated(
    event: DomainEvent<PolisEvents.PersonCreated>,
  ): Promise<void> {
    await this.directory.recordPerson(event);
  }

  @OnDomainEvent('polis.person.updated')
  @Transactional()
  async onPersonUpdated(
    event: DomainEvent<PolisEvents.PersonUpdated>,
  ): Promise<void> {
    await this.directory.recordPerson(event);
  }

  @OnDomainEvent('polis.person.deleted')
  @Transactional()
  async onPersonDeleted(
    event: DomainEvent<PolisEvents.PersonDeleted>,
  ): Promise<void> {
    if (await this.directory.deletePerson(event)) {
      await this.assignments.endAllFor(
        organizationOf(event),
        'person',
        event.payload.personId,
        'Person deleted',
      );
    }
  }

  @OnDomainEvent('agora.agent.created')
  @Transactional()
  async onAgentCreated(
    event: DomainEvent<AgoraEvents.AgentCreated>,
  ): Promise<void> {
    await this.directory.recordAgent(event);
  }

  @OnDomainEvent('agora.agent.archived')
  @Transactional()
  async onAgentArchived(
    event: DomainEvent<AgoraEvents.AgentArchived>,
  ): Promise<void> {
    if (await this.directory.archiveAgent(event)) {
      await this.assignments.endAllFor(
        organizationOf(event),
        'agent',
        event.payload.agentId,
        'Agent archived',
      );
    }
  }
}
