import { ServiceUnavailableException } from '@nestjs/common';

import { DomainError } from '@hephaestus/core';

export class OrganizationSuspendedError extends DomainError {
  constructor(organizationId: string) {
    super(
      `Organization ${organizationId} is suspended and can't be changed.`,
      'ORGANIZATION_SUSPENDED',
    );
  }
}

export class ProjectArchivedError extends DomainError {
  constructor(projectId: string) {
    super(
      `Project ${projectId} is archived and can't be changed.`,
      'PROJECT_ARCHIVED',
    );
  }
}

/** Polis couldn't be asked about an unknown organization or project (503). */
export class PolisUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super(
      `Hephaestus: Polis can't be reached right now (${reason}). Try again.`,
    );
  }
}
