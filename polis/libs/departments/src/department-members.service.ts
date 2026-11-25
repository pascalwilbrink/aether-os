import { Injectable, NotFoundException } from '@nestjs/common';
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
} from '@polis/core';
import { MembershipsService } from '@polis/memberships';

import type { AddDepartmentMemberRequest } from './dto/add-department-member.request.js';
import type { DepartmentMemberResponse } from './dto/department-member.response.js';
import { DepartmentMemberEntity } from './department-member.entity.js';
import { DepartmentMemberMapper } from './department-member.mapper.js';
import {
  DepartmentMemberExistsError,
  DepartmentMemberNotInOrganizationError,
} from './department.errors.js';
import { DepartmentsService } from './departments.service.js';

type MemberRef = Pick<
  DepartmentMemberEntity,
  'id' | 'organizationId' | 'departmentId' | 'subjectType' | 'subject'
>;

/**
 * Who is in a department: members of the organization, for information
 * (it grants nothing). Adding and removing need an active department;
 * leaving the organization removes the principal from its departments, in
 * the same transaction (the local `membership.revoked` event).
 */
@Injectable()
export class DepartmentMembersService {
  constructor(
    @InjectRepository(DepartmentMemberEntity)
    private readonly members: Repository<DepartmentMemberEntity>,
    private readonly mapper: DepartmentMemberMapper,
    private readonly departments: DepartmentsService,
    private readonly memberships: MembershipsService,
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  @Transactional()
  async add(
    organizationId: string,
    departmentId: string,
    dto: AddDepartmentMemberRequest,
  ): Promise<DepartmentMemberResponse> {
    await this.departments.assertActive(organizationId, departmentId);
    if (
      !(await this.memberships.rolesOf(
        organizationId,
        dto.subjectType,
        dto.subject,
      ))
    ) {
      throw new DepartmentMemberNotInOrganizationError(
        dto.subjectType,
        dto.subject,
      );
    }
    const entity = this.mapper.toEntity(
      dto,
      { organizationId, departmentId },
      this.access.principal().sub,
      new Date(),
    );
    try {
      await this.members.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DepartmentMemberExistsError(dto.subjectType, dto.subject);
      }
      throw error;
    }
    await this.emit('department-member.added', entity);

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    departmentId: string,
    page: PageRequest,
  ): Promise<Page<DepartmentMemberResponse>> {
    await this.departments.assertExists(organizationId, departmentId);
    const entities = await findPage(
      this.members,
      {
        where: { organizationId, departmentId },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  @Transactional()
  async remove(
    organizationId: string,
    departmentId: string,
    memberId: string,
  ): Promise<void> {
    await this.departments.assertActive(organizationId, departmentId);
    const entity = await this.members.findOne({
      where: { id: memberId, organizationId, departmentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entity) {
      throw new NotFoundException(`Department member ${memberId} not found`);
    }
    await this.removeOne(entity);
  }

  /** Leaving the organization ends every department membership in it. */
  @OnDomainEvent('polis.membership.revoked')
  async onOrganizationMembershipRevoked(
    event: DomainEvent<PolisEventPayloads['membership.revoked']>,
  ): Promise<void> {
    const { principal, scope } = event.payload;
    const entities = await this.members.find({
      where: {
        organizationId: scope.organizationId,
        subjectType: principal.sub_type,
        subject: principal.sub,
      },
      lock: { mode: 'pessimistic_write' },
    });
    for (const entity of entities) {
      await this.removeOne(entity);
    }
  }

  private async removeOne(entity: DepartmentMemberEntity): Promise<void> {
    // `remove` clears the entity's ID; the event needs it.
    const snapshot: MemberRef = {
      id: entity.id,
      organizationId: entity.organizationId,
      departmentId: entity.departmentId,
      subjectType: entity.subjectType,
      subject: entity.subject,
    };
    await this.members.remove(entity);
    await this.emit('department-member.removed', snapshot);
  }

  /** A member is added once and removed once: versions 1 and 2. */
  private async emit(
    eventType: 'department-member.added' | 'department-member.removed',
    entity: MemberRef,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateId: entity.id,
      aggregateVersion: eventType === 'department-member.added' ? 1 : 2,
      organizationId: entity.organizationId,
      payload: {
        memberId: entity.id,
        departmentId: entity.departmentId,
        principal: { sub: entity.subject, sub_type: entity.subjectType },
      },
    });
  }
}
