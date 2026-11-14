import type {
  OrganizationId,
  Page,
  PageRequest,
  ProjectId,
} from '@hephaestus/core';

import type { Project } from '../project.js';

export abstract class ProjectRepository {
  /** Throws ProjectSlugTakenError if the slug is in use in the organization. */
  abstract save(project: Project): Promise<void>;

  abstract findById(
    organizationId: OrganizationId,
    projectId: ProjectId,
  ): Promise<Project | null>;

  /** Newest first. */
  abstract findByOrganization(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Project>>;
}
