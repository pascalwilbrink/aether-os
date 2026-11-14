import { DomainError, type ProjectId } from '@polis/core';

export class ProjectArchivedError extends DomainError {
  constructor(public readonly projectId: ProjectId) {
    super(`Project ${projectId} is archived`, 'PROJECT_ARCHIVED');
  }
}
