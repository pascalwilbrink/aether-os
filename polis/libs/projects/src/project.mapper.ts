import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateProjectRequest } from './dto/create-project.request.js';
import type { ProjectResponse } from './dto/project.response.js';
import { ProjectEntity } from './project.entity.js';

@Injectable()
export class ProjectMapper {
  /** A new, active project; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateProjectRequest,
    organizationId: string,
    now: Date,
  ): ProjectEntity {
    return Object.assign(new ProjectEntity(), {
      id: uuidv7(),
      organizationId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      status: 'active',
      createdBy: dto.createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies ProjectEntity);
  }

  toResponse(entity: ProjectEntity): ProjectResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
