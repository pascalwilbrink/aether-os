import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  AccessControl,
  type ApiTypes,
  findPage,
  isUniqueViolation,
  mapPage,
  PolisEvents,
  Transactional,
  type MembershipEventBase,
  type Page,
  type PageRequest,
} from '@polis/core';
import { OrganizationsService } from '@polis/organizations';

import type { CreateMembershipRequest } from './dto/create-membership.request.js';
import type { MembershipResponse } from './dto/membership.response.js';
import type { SubjectMembershipResponse } from './dto/subject-membership.response.js';
import type { UpdateMembershipRequest } from './dto/update-membership.request.js';
import type { OrganizationRole, SubjectType } from './membership-roles.js';
import { MembershipEntity } from './membership.entity.js';
import { LastOwnerError, MembershipExistsError } from './membership.errors.js';
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
    private readonly events: PolisEvents,
    private readonly access: AccessControl,
  ) {}

  /** Grants a membership; granting `owner` takes an owner. */
  @Transactional()
  create(
    organizationId: string,
    dto: CreateMembershipRequest,
  ): Promise<MembershipResponse> {
    this.assertMayTouchOwners(dto.roles);
    return this.grant(organizationId, dto, this.access.principal().sub);
  }

  /**
   * Makes the user who founded an organization its first owner, in the
   * transaction that created it (`FoundersService`).
   */
  @Transactional()
  grantFounder(
    organizationId: string,
    userId: string,
  ): Promise<MembershipResponse> {
    return this.grant(
      organizationId,
      { subjectType: 'user', subject: userId, roles: ['owner'] },
      userId,
    );
  }

  private async grant(
    organizationId: string,
    dto: CreateMembershipRequest,
    createdBy: string,
  ): Promise<MembershipResponse> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const entity = this.mapper.toEntity(
      dto,
      organizationId,
      createdBy,
      new Date(),
    );
    try {
      await this.memberships.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new MembershipExistsError(dto.subjectType, dto.subject);
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'membership.granted',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: { ...this.eventBase(entity), roles: entity.roles },
    });

    return this.mapper.toResponse(entity);
  }

  /** The organization's memberships, newest first; only users or only service accounts with `subjectType`. */
  async list(
    organizationId: string,
    page: PageRequest,
    subjectType?: SubjectType,
  ): Promise<Page<MembershipResponse>> {
    await this.organizations.assertExists(organizationId);

    return this.page(
      subjectType ? { organizationId, subjectType } : { organizationId },
      page,
    );
  }

  /**
   * Every membership of one principal, across organizations: Pistis (for
   * token claims, `platform:read`), or the principal itself (to choose an
   * organization).
   */
  async listOfSubject(
    subjectType: SubjectType,
    subject: string,
    page: PageRequest,
  ): Promise<Page<SubjectMembershipResponse>> {
    const caller = this.access.principal();
    const own = caller.subType === subjectType && caller.sub === subject;
    if (!own && !this.access.hasPlatformPermission('platform:read')) {
      throw new ForbiddenException('Only your own memberships');
    }
    const memberships = await this.page({ subjectType, subject }, page);
    const organizations = await this.organizations.summaries(
      memberships.items.map((item) => item.organizationId),
    );
    return {
      ...memberships,
      items: memberships.items.map((item: ApiTypes.MembershipResponse) => ({
        ...item,
        organization: organizations.get(item.organizationId) ?? {
          name: '',
          slug: '',
        },
      })),
    };
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

    const owners = await this.lockOwners(organizationId);
    const entity = await this.load(organizationId, membershipId, true);
    this.assertMayTouchOwners([...entity.roles, ...dto.roles]);
    const from = entity.roles;
    this.mapper.applyTo(entity, dto, new Date());
    if (
      owners.length === 1 &&
      owners[0] === entity.id &&
      !entity.roles.includes('owner')
    ) {
      throw new LastOwnerError();
    }
    if (sameRoles(from, entity.roles)) {
      // Nothing changed: no new version, no event.
      return this.mapper.toResponse(
        await this.load(organizationId, membershipId),
      );
    }
    await this.memberships.save(entity);
    await this.events.emit({
      eventType: 'membership.role-changed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      payload: { ...this.eventBase(entity), from, to: entity.roles },
    });

    return this.mapper.toResponse(entity);
  }

  @Transactional()
  async delete(organizationId: string, membershipId: string): Promise<void> {
    await this.organizations.assertAcceptsWrites(organizationId);

    const owners = await this.lockOwners(organizationId);
    const entity = await this.load(organizationId, membershipId, true);
    this.assertMayTouchOwners(entity.roles);
    if (owners.length === 1 && owners[0] === entity.id) {
      throw new LastOwnerError();
    }
    const base = this.eventBase(entity);
    await this.memberships.remove(entity);
    await this.events.emit({
      eventType: 'membership.revoked',
      aggregateId: base.membershipId,
      aggregateVersion: entity.version + 1,
      organizationId,
      payload: base,
    });
  }

  /** A principal's roles in an organization, or null if not a member. */
  async rolesOf(
    organizationId: string,
    subjectType: SubjectType,
    subject: string,
  ): Promise<OrganizationRole[] | null> {
    const entity = await this.memberships.findOneBy({
      organizationId,
      subjectType,
      subject,
    });
    return entity?.roles ?? null;
  }

  /**
   * The organization's owner memberships, locked (in ID order) before the
   * membership being changed, so two owners demoting each other at once
   * can't both pass the last-owner check: the second waits, and then no
   * longer counts the first. Their IDs.
   */
  private async lockOwners(organizationId: string): Promise<string[]> {
    const owners = await this.memberships
      .createQueryBuilder('membership')
      .select('membership.id')
      .where('membership.organizationId = :organizationId', { organizationId })
      .andWhere(':owner = ANY(membership.roles)', { owner: 'owner' })
      .orderBy('membership.id')
      .setLock('pessimistic_write')
      .getMany();
    return owners.map((owner) => owner.id);
  }

  /** Owners are managed by owners only (docs/identity.md, Roles). */
  private assertMayTouchOwners(roles: readonly string[]): void {
    if (
      roles.includes('owner') &&
      !this.access.principal().organizationRoles.includes('owner')
    ) {
      throw new ForbiddenException('Only owners manage owners');
    }
  }

  private eventBase(entity: MembershipEntity): MembershipEventBase {
    return {
      membershipId: entity.id,
      principal: { sub: entity.subject, sub_type: entity.subjectType },
      scope: { type: 'organization', organizationId: entity.organizationId },
    };
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

function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((role, i) => role === b[i]);
}
