import { Injectable } from '@nestjs/common';

import type { OrganizationId, ProjectId } from '@polis/core';

import { Project } from '../../../domain/project.js';
import { ProjectEntity } from '../entity/project.entity.js';

@Injectable()
export class ProjectMapper {
  toEntity(project: Project): ProjectEntity {
    return Object.assign(new ProjectEntity(), {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      createdBy: project.createdBy,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    } satisfies ProjectEntity);
  }

  toDomain(entity: ProjectEntity): Project {
    return Project.reconstitute({
      id: entity.id as ProjectId,
      organizationId: entity.organizationId as OrganizationId,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
