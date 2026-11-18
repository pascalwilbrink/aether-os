import { DomainError } from '@proxenos/core';

export class RepositoryAlreadyLinkedError extends DomainError {
  constructor(repositoryId: string, projectId: string) {
    super(
      `Repository ${repositoryId} is already linked to project ${projectId}.`,
      'REPOSITORY_ALREADY_LINKED',
    );
  }
}
