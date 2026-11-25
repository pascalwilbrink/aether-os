import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  PolisEvents,
  Transactional,
  type Page,
  type PageRequest,
} from '@polis/core';
import { OrganizationsService } from '@polis/organizations';

import type { CreateTeamRequest } from './dto/create-team.request.js';
import type { TeamMemberResponse } from './dto/team-member.response.js';
import type { TeamResponse } from './dto/team.response.js';
import type { UpdateTeamRequest } from './dto/update-team.request.js';
import { TeamDepartmentsService } from './team-departments.service.js';
import { TeamMembersService } from './team-members.service.js';
import { TeamEntity } from './team.entity.js';
import { TeamArchivedError, TeamSlugTakenError } from './team.errors.js';
import { TeamMapper } from './team.mapper.js';

/**
 * An organization's teams: persons working together (`TeamMembersService`),
 * in any of its departments (`TeamDepartmentsService`). Reads require the
 * organization to exist (404); writes also require it to be active
 * (`ORGANIZATION_SUSPENDED`). An archived team can't be changed or take
 * members (`TEAM_ARCHIVED`).
 */
@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teams: Repository<TeamEntity>,
    private readonly mapper: TeamMapper,
    private readonly organizations: OrganizationsService,
    private readonly departments: TeamDepartmentsService,
    private readonly members: TeamMembersService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateTeamRequest,
  ): Promise<TeamResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.teams.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new TeamSlugTakenError(dto.slug);
      }
      throw error;
    }
    const { departmentIds } = await this.departments.set(
      organizationId,
      entity.id,
      dto.departmentIds ?? [],
    );
    await this.emit('team.created', entity, departmentIds);
    return this.mapper.toResponse(entity, departmentIds);
  }

  async list(
    organizationId: string,
    query: PageRequest & {
      status?: TeamEntity['status'];
      departmentId?: string;
      personId?: string;
    },
  ): Promise<Page<TeamResponse>> {
    await this.organizations.assertExists(organizationId);
    const { status, departmentId, personId, ...page } = query;
    let ids: string[] | undefined;
    if (departmentId) {
      ids = await this.departments.teamIdsIn(organizationId, departmentId);
    }
    if (personId) {
      const ofPerson = await this.members.teamIdsOf(organizationId, personId);
      ids = ids ? ids.filter((id) => ofPerson.includes(id)) : ofPerson;
    }
    if (ids?.length === 0) {
      return { items: [], nextCursor: null };
    }
    const entities = await findPage(
      this.teams,
      {
        where: {
          organizationId,
          ...(status ? { status } : {}),
          ...(ids ? { id: ids } : {}),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    const departments = await this.departments.of(
      entities.items.map((entity) => entity.id),
    );
    return {
      items: entities.items.map((entity) =>
        this.mapper.toResponse(entity, departments.get(entity.id) ?? []),
      ),
      nextCursor: entities.nextCursor,
    };
  }

  async findById(
    organizationId: string,
    teamId: string,
  ): Promise<TeamResponse> {
    await this.organizations.assertExists(organizationId);
    const entity = await this.load(organizationId, teamId);
    const departments = await this.departments.of([entity.id]);
    return this.mapper.toResponse(entity, departments.get(entity.id) ?? []);
  }

  /** PUT: the name, description and departments; unchanged → no new version, no event. */
  @Transactional()
  async update(
    organizationId: string,
    teamId: string,
    dto: UpdateTeamRequest,
  ): Promise<TeamResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.loadActive(organizationId, teamId);
    const name = dto.name.trim();
    const description = dto.description.trim();
    const fieldsChanged =
      entity.name !== name || entity.description !== description;
    const { departmentIds, changed } = await this.departments.set(
      organizationId,
      entity.id,
      dto.departmentIds,
    );
    if (!fieldsChanged && !changed) {
      return this.mapper.toResponse(entity, departmentIds);
    }
    entity.name = name;
    entity.description = description;
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.teams.save(entity);
    await this.emit('team.updated', entity, departmentIds);
    return this.mapper.toResponse(entity, departmentIds);
  }

  /** Final; idempotent. Its members and departments stay, for the record. */
  @Transactional()
  async archive(organizationId: string, teamId: string): Promise<TeamResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    const entity = await this.load(organizationId, teamId, true);
    const departmentIds =
      (await this.departments.of([entity.id])).get(entity.id) ?? [];
    if (entity.status === 'archived') {
      return this.mapper.toResponse(entity, departmentIds);
    }
    entity.status = 'archived';
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.teams.save(entity);
    await this.emit('team.archived', entity, departmentIds);
    return this.mapper.toResponse(entity, departmentIds);
  }

  @Transactional()
  async addMember(
    organizationId: string,
    teamId: string,
    personId: string,
  ): Promise<TeamMemberResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);
    await this.loadActive(organizationId, teamId);
    return this.members.add(organizationId, teamId, personId);
  }

  async listMembers(
    organizationId: string,
    teamId: string,
    page: PageRequest,
  ): Promise<Page<TeamMemberResponse>> {
    await this.organizations.assertExists(organizationId);
    await this.load(organizationId, teamId);
    return this.members.list(organizationId, teamId, page);
  }

  @Transactional()
  async removeMember(
    organizationId: string,
    teamId: string,
    personId: string,
  ): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);
    await this.loadActive(organizationId, teamId);
    await this.members.remove(organizationId, teamId, personId);
  }

  private async emit(
    eventType: 'team.created' | 'team.updated' | 'team.archived',
    entity: TeamEntity,
    departmentIds: string[],
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      payload: { teamId: entity.id, departmentIds },
    });
  }

  /** An active team, locked (shared would do for members; one lock mode keeps it simple). */
  private async loadActive(
    organizationId: string,
    teamId: string,
  ): Promise<TeamEntity> {
    const entity = await this.load(organizationId, teamId, true);
    if (entity.status !== 'active') {
      throw new TeamArchivedError(teamId);
    }
    return entity;
  }

  /** Scoped to the organization: another organization's team is a 404. */
  private async load(
    organizationId: string,
    teamId: string,
    forUpdate = false,
  ): Promise<TeamEntity> {
    const entity = await this.teams.findOne({
      where: { id: teamId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Team ${teamId} not found`);
    }
    return entity;
  }
}
