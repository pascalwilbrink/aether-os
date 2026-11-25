import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { AddDepartmentMemberRequest } from './dto/add-department-member.request.js';
import type { DepartmentMemberResponse } from './dto/department-member.response.js';
import { DepartmentMemberEntity } from './department-member.entity.js';

@Injectable()
export class DepartmentMemberMapper {
  /** A new department member; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: AddDepartmentMemberRequest,
    scope: { organizationId: string; departmentId: string },
    createdBy: string,
    now: Date,
  ): DepartmentMemberEntity {
    return Object.assign(new DepartmentMemberEntity(), {
      id: uuidv7(),
      organizationId: scope.organizationId,
      departmentId: scope.departmentId,
      subjectType: dto.subjectType,
      subject: dto.subject,
      createdBy,
      createdAt: now,
    } satisfies DepartmentMemberEntity);
  }

  toResponse(entity: DepartmentMemberEntity): DepartmentMemberResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      departmentId: entity.departmentId,
      subjectType: entity.subjectType,
      subject: entity.subject,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
