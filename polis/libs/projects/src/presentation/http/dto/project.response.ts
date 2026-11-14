import type { Project, ProjectStatus } from '../../../domain/project.js';

import type { ApiSchema } from '@polis/core';

export class ProjectResponse implements ApiSchema<'ProjectResponse'> {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  status: ProjectStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  static fromDomain(project: Project): ProjectResponse {
    return Object.assign(new ProjectResponse(), {
      id: project.id,
      organizationId: project.organizationId,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: project.status,
      createdBy: project.createdBy,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
    } satisfies ProjectResponse);
  }
}
