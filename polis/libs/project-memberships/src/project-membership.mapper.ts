import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateProjectMembershipRequest } from './dto/create-project-membership.request.js';
import type { ProjectMembershipResponse } from './dto/project-membership.response.js';
import { ProjectMembershipEntity } from './project-membership.entity.js';

@Injectable()
export class ProjectMembershipMapper {
  /** A new grant; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateProjectMembershipRequest,
    scope: { organizationId: string; projectId: string },
    createdBy: string,
    now: Date,
  ): ProjectMembershipEntity {
    return Object.assign(new ProjectMembershipEntity(), {
      id: uuidv7(),
      organizationId: scope.organizationId,
      projectId: scope.projectId,
      subjectType: dto.subjectType,
      subject: dto.subject,
      role: dto.role,
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies ProjectMembershipEntity);
  }

  toResponse(entity: ProjectMembershipEntity): ProjectMembershipResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      subjectType: entity.subjectType,
      subject: entity.subject,
      role: entity.role,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
