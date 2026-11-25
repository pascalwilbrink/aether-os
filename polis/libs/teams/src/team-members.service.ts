import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  mapPage,
  OnDomainEvent,
  PolisEvents,
  type DomainEvent,
  type Page,
  type PageRequest,
  type PolisEventPayloads,
} from '@polis/core';
import { PersonsService } from '@polis/persons';

import type { TeamMemberResponse } from './dto/team-member.response.js';
import { TeamMemberEntity } from './team-member.entity.js';
import { TeamMemberExistsError } from './team.errors.js';
import { TeamMapper } from './team.mapper.js';

/**
 * Who is in which team: persons of the organization. `TeamsService` checks
 * the team before adding or removing; deleting a person removes them from
 * their teams in the same transaction (the local `person.deleted` event).
 */
@Injectable()
export class TeamMembersService {
  constructor(
    @InjectRepository(TeamMemberEntity)
    private readonly members: Repository<TeamMemberEntity>,
    private readonly mapper: TeamMapper,
    private readonly persons: PersonsService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  /** Adds a person of the organization to a team the caller checked. */
  async add(
    organizationId: string,
    teamId: string,
    personId: string,
  ): Promise<TeamMemberResponse> {
    await this.persons.assertExists(organizationId, personId);
    const entity = Object.assign(new TeamMemberEntity(), {
      id: uuidv7(),
      organizationId,
      teamId,
      personId,
      addedBy: this.access.principal().sub,
      addedAt: new Date(),
    } satisfies TeamMemberEntity);
    try {
      await this.members.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TeamMemberExistsError(personId);
      }
      throw error;
    }
    await this.emit('team-member.added', entity, 1);
    return this.mapper.toMemberResponse(entity);
  }

  async list(
    organizationId: string,
    teamId: string,
    page: PageRequest,
  ): Promise<Page<TeamMemberResponse>> {
    const entities = await findPage(
      this.members,
      {
        where: { organizationId, teamId },
        sortBy: 'addedAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toMemberResponse(entity));
  }

  /** Takes a person out of a team the caller checked; 404 when they aren't in it. */
  async remove(
    organizationId: string,
    teamId: string,
    personId: string,
  ): Promise<void> {
    const entity = await this.members.findOne({
      where: { organizationId, teamId, personId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) {
      throw new NotFoundException(`Person ${personId} isn't in team ${teamId}`);
    }
    await this.removeOne(entity);
  }

  /** The teams a person is in. */
  async teamIdsOf(organizationId: string, personId: string): Promise<string[]> {
    const rows = await this.members.find({
      where: { organizationId, personId },
      select: { teamId: true },
    });
    return rows.map((row) => row.teamId);
  }

  /** A deleted person leaves every team. */
  @OnDomainEvent('polis.person.deleted')
  async onPersonDeleted(
    event: DomainEvent<PolisEventPayloads['person.deleted']>,
  ): Promise<void> {
    const entities = await this.members.find({
      where: { personId: event.payload.personId },
      lock: { mode: 'pessimistic_write' },
    });
    for (const entity of entities) {
      await this.removeOne(entity);
    }
  }

  private async removeOne(entity: TeamMemberEntity): Promise<void> {
    const removed = Object.assign(new TeamMemberEntity(), {
      id: entity.id,
      organizationId: entity.organizationId,
      teamId: entity.teamId,
      personId: entity.personId,
      addedBy: entity.addedBy,
      addedAt: entity.addedAt,
    } satisfies TeamMemberEntity);
    await this.members.delete({ id: entity.id });
    await this.emit('team-member.removed', removed, 2);
  }

  /** A membership is added once and removed once: versions 1 and 2. */
  private async emit(
    eventType: 'team-member.added' | 'team-member.removed',
    entity: TeamMemberEntity,
    version: number,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateId: entity.id,
      aggregateVersion: version,
      organizationId: entity.organizationId,
      payload: { teamId: entity.teamId, personId: entity.personId },
    });
  }
}
