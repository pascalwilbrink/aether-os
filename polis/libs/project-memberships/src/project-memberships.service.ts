import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  isUniqueViolation,
  mapPage,
  OnDomainEvent,
  PolisEvents,
  Transactional,
  type DomainEvent,
  type Page,
  type PageRequest,
  type PolisEventPayloads,
  type ProjectMembershipEventBase,
} from '@polis/core';
import { MembershipsService } from '@polis/memberships';
import { ProjectsService } from '@polis/projects';

import type { CreateProjectMembershipRequest } from './dto/create-project-membership.request.js';
import type { ProjectMembershipResponse } from './dto/project-membership.response.js';
import type { UpdateProjectMembershipRequest } from './dto/update-project-membership.request.js';
import { ProjectMembershipEntity } from './project-membership.entity.js';
import {
  ProjectMemberNotInOrganizationError,
  ProjectMembershipExistsError,
  ProjectRoleExceedsCapError,
} from './project-membership.errors.js';
import { ProjectMembershipMapper } from './project-membership.mapper.js';
import type { ProjectRole, SubjectType } from './project-membership.types.js';
import { capRole, grantableCap, withinCap } from './project-role-cap.js';

/**
 * Project memberships: a member of the organization with one role in one
 * project (`approver`, `editor`, `viewer`; docs/identity.md). A grant never
 * exceeds what the organization role allows, and follows it: when the
 * organization role is lowered the grant is capped, and when the
 * organization membership goes, the grants go too (in the same transaction,
 * from the local membership events).
 */
@Injectable()
export class ProjectMembershipsService {
  constructor(
    @InjectRepository(ProjectMembershipEntity)
    private readonly grants: Repository<ProjectMembershipEntity>,
    private readonly mapper: ProjectMembershipMapper,
    private readonly projects: ProjectsService,
    private readonly memberships: MembershipsService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    dto: CreateProjectMembershipRequest,
  ): Promise<ProjectMembershipResponse> {
    await this.projects.assertActive(organizationId, projectId);
    await this.assertGrantable(
      organizationId,
      dto.subjectType,
      dto.subject,
      dto.role,
    );

    const entity = this.mapper.toEntity(
      dto,
      { organizationId, projectId },
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.grants.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ProjectMembershipExistsError(dto.subjectType, dto.subject);
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'project-membership.granted',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId,
      payload: { ...this.eventBase(entity), role: entity.role },
    });

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    projectId: string,
    page: PageRequest,
  ): Promise<Page<ProjectMembershipResponse>> {
    await this.projects.assertExists(organizationId, projectId);
    return this.page({ organizationId, projectId }, page);
  }

  async findById(
    organizationId: string,
    projectId: string,
    membershipId: string,
  ): Promise<ProjectMembershipResponse> {
    await this.projects.assertExists(organizationId, projectId);
    return this.mapper.toResponse(
      await this.load(organizationId, projectId, membershipId),
    );
  }

  /** PUT: the role, capped like a grant; unchanged → no new version, no event. */
  @Transactional()
  async update(
    organizationId: string,
    projectId: string,
    membershipId: string,
    dto: UpdateProjectMembershipRequest,
  ): Promise<ProjectMembershipResponse> {
    await this.projects.assertActive(organizationId, projectId);
    const entity = await this.load(
      organizationId,
      projectId,
      membershipId,
      true,
    );
    if (entity.role === dto.role) {
      return this.mapper.toResponse(entity);
    }
    await this.assertGrantable(
      organizationId,
      entity.subjectType,
      entity.subject,
      dto.role,
    );
    await this.changeRole(entity, dto.role);

    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async delete(
    organizationId: string,
    projectId: string,
    membershipId: string,
  ): Promise<void> {
    await this.projects.assertActive(organizationId, projectId);
    await this.revoke(
      await this.load(organizationId, projectId, membershipId, true),
    );
  }

  /**
   * One principal's grants in one organization: Pistis (for
   * `project_roles`, `platform:read`) or the principal itself.
   */
  listOfSubject(
    organizationId: string,
    subjectType: SubjectType,
    subject: string,
    page: PageRequest,
  ): Promise<Page<ProjectMembershipResponse>> {
    const caller = this.access.principal();
    const own = caller.subType === subjectType && caller.sub === subject;
    if (!own && !this.access.hasPlatformPermission('platform:read')) {
      throw new ForbiddenException('Only your own project memberships');
    }
    return this.page({ organizationId, subjectType, subject }, page);
  }

  /** A lowered organization role caps the principal's grants in it. */
  @OnDomainEvent('polis.membership.role-changed')
  async onOrganizationRoleChanged(
    event: DomainEvent<PolisEventPayloads['membership.role-changed']>,
  ): Promise<void> {
    const { principal, scope, to } = event.payload;
    const cap = grantableCap(principal.sub_type, to);
    for (const grant of await this.grantsOf(scope.organizationId, principal)) {
      if (cap === null) {
        await this.revoke(grant);
      } else if (!withinCap(grant.role, cap)) {
        await this.changeRole(grant, capRole(grant.role, cap));
      }
    }
  }

  /** Leaving the organization ends every grant in it. */
  @OnDomainEvent('polis.membership.revoked')
  async onOrganizationMembershipRevoked(
    event: DomainEvent<PolisEventPayloads['membership.revoked']>,
  ): Promise<void> {
    const { principal, scope } = event.payload;
    for (const grant of await this.grantsOf(scope.organizationId, principal)) {
      await this.revoke(grant);
    }
  }

  private async assertGrantable(
    organizationId: string,
    subjectType: SubjectType,
    subject: string,
    role: ProjectRole,
  ): Promise<void> {
    const roles = await this.memberships.rolesOf(
      organizationId,
      subjectType,
      subject,
    );
    if (!roles) {
      throw new ProjectMemberNotInOrganizationError(subjectType, subject);
    }
    const cap = grantableCap(subjectType, roles);
    if (!withinCap(role, cap)) {
      throw new ProjectRoleExceedsCapError(role, cap ?? 'none');
    }
  }

  private async changeRole(
    entity: ProjectMembershipEntity,
    role: ProjectRole,
  ): Promise<void> {
    const from = entity.role;
    entity.role = role;
    entity.updatedAt = new Date();
    entity.version += 1;
    await this.grants.save(entity);
    await this.events.emit({
      eventType: 'project-membership.role-changed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      payload: { ...this.eventBase(entity), from, to: role },
    });
  }

  private async revoke(entity: ProjectMembershipEntity): Promise<void> {
    const base = this.eventBase(entity);
    const version = entity.version + 1;
    await this.grants.remove(entity);
    await this.events.emit({
      eventType: 'project-membership.revoked',
      aggregateId: base.membershipId,
      aggregateVersion: version,
      organizationId: base.scope.organizationId,
      projectId: base.scope.projectId,
      payload: base,
    });
  }

  private grantsOf(
    organizationId: string,
    principal: { sub: string; sub_type: SubjectType },
  ): Promise<ProjectMembershipEntity[]> {
    return this.grants.find({
      where: {
        organizationId,
        subjectType: principal.sub_type,
        subject: principal.sub,
      },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private eventBase(
    entity: ProjectMembershipEntity,
  ): ProjectMembershipEventBase {
    return {
      membershipId: entity.id,
      principal: { sub: entity.subject, sub_type: entity.subjectType },
      scope: {
        type: 'project',
        organizationId: entity.organizationId,
        projectId: entity.projectId,
      },
    };
  }

  private async page(
    where: Partial<
      Record<'organizationId' | 'projectId' | 'subjectType' | 'subject', string>
    >,
    page: PageRequest,
  ): Promise<Page<ProjectMembershipResponse>> {
    const entities = await findPage(
      this.grants,
      { where, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  /** Scoped to the project: another project's grant is a 404. */
  private async load(
    organizationId: string,
    projectId: string,
    membershipId: string,
    forUpdate = false,
  ): Promise<ProjectMembershipEntity> {
    const entity = await this.grants.findOne({
      where: { id: membershipId, organizationId, projectId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(
        `Project membership ${membershipId} not found`,
      );
    }
    return entity;
  }
}
