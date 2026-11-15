import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateMembershipRequest } from './dto/create-membership.request.js';
import type { MembershipResponse } from './dto/membership.response.js';
import type { UpdateMembershipRequest } from './dto/update-membership.request.js';
import { normalizeRoles } from './membership-roles.js';
import { MembershipEntity } from './membership.entity.js';

@Injectable()
export class MembershipMapper {
  /** A new membership; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateMembershipRequest,
    organizationId: string,
    now: Date,
  ): MembershipEntity {
    return Object.assign(new MembershipEntity(), {
      id: uuidv7(),
      organizationId,
      subjectType: dto.subjectType,
      subject: dto.subject,
      roles: normalizeRoles(dto.roles),
      createdBy: dto.createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies MembershipEntity);
  }

  /** PUT: every editable field (the roles) is replaced. */
  applyTo(
    entity: MembershipEntity,
    dto: UpdateMembershipRequest,
    now: Date,
  ): MembershipEntity {
    entity.roles = normalizeRoles(dto.roles);
    entity.updatedAt = now;
    entity.version += 1;

    return entity;
  }

  toResponse(entity: MembershipEntity): MembershipResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      subjectType: entity.subjectType,
      subject: entity.subject,
      roles: normalizeRoles(entity.roles),
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
