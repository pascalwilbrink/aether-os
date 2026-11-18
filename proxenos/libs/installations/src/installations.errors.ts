import { DomainError } from '@proxenos/core';

export class InstallationNotActiveError extends DomainError {
  constructor(installationId: string) {
    super(
      `Installation ${installationId} is suspended or uninstalled on GitHub.`,
      'INSTALLATION_NOT_ACTIVE',
    );
  }
}

export class RepositoryUnavailableError extends DomainError {
  constructor(repositoryId: string) {
    super(
      `Repository ${repositoryId} isn't covered by an active installation any more.`,
      'REPOSITORY_UNAVAILABLE',
    );
  }
}
