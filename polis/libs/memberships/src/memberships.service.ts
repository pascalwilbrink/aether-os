import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  isUniqueViolation,
  mapPage,
  Transactional,
  type Page,
  type PageRequest,
} from '@polis/core';
import { OrganizationsService } from '@polis/organizations';

import type { CreateMembershipRequest } from './dto/create-membership.request.js';
import type { MembershipResponse } from './dto/membership.response.js';
import type { UpdateMembershipRequest } from './dto/update-membership.request.js';
import type { SubjectType } from './membership-roles.js';
import { MembershipEntity } from './membership.entity.js';
import { MembershipExistsError } from './membership.errors.js';
import { MembershipMapper } from './membership.mapper.js';

/**
 * Which principal belongs to which organization, with which fixed roles.
 * Reads require the organization to exist; writes also require it to be
 * active (`ORGANIZATION_SUSPENDED` otherwise).
 */
@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly mapper: MembershipMapper,
    private readonly organizations: OrganizationsService,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    dto: CreateMembershipRequest,
  ): Promise<MembershipResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = this.mapper.toEntity(dto, organizationId, new Date());
    try {
      await this.memberships.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MembershipExistsError(dto.subjectType, dto.subject);
      }
      throw error;
    }

    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<MembershipResponse>> {
    await this.organizations.assertExists(organizationId);

    return this.page({ organizationId }, page);
  }

  /** Every membership of one principal, across organizations (for Pistis). */
  listOfSubject(
    subjectType: SubjectType,
    subject: string,
    page: PageRequest,
  ): Promise<Page<MembershipResponse>> {
    return this.page({ subjectType, subject }, page);
  }

  async findById(
    organizationId: string,
    membershipId: string,
  ): Promise<MembershipResponse> {
    await this.organizations.assertExists(organizationId);

    return this.mapper.toResponse(
      await this.load(organizationId, membershipId),
    );
  }

  @Transactional()
  async update(
    organizationId: string,
    membershipId: string,
    dto: UpdateMembershipRequest,
  ): Promise<MembershipResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = await this.load(organizationId, membershipId, true);
    await this.memberships.save(this.mapper.applyTo(entity, dto, new Date()));

    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async delete(organizationId: string, membershipId: string): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = await this.load(organizationId, membershipId, true);
    await this.memberships.remove(entity);
  }

  private async page(
    where: Partial<
      Record<'organizationId' | 'subjectType' | 'subject', string>
    >,
    page: PageRequest,
  ): Promise<Page<MembershipResponse>> {
    const entities = await findPage(
      this.memberships,
      { where, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  /** Scoped to the organization: another organization's membership is a 404. */
  private async load(
    organizationId: string,
    membershipId: string,
    forUpdate = false,
  ): Promise<MembershipEntity> {
    const entity = await this.memberships.findOne({
      where: { id: membershipId, organizationId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Membership ${membershipId} not found`);
    }

    return entity;
  }
}
