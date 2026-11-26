import { ServiceUnavailableException } from '@nestjs/common';

import { DomainError } from '@seshat/core';

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

export class DepartmentArchivedError extends DomainError {
  constructor(departmentId: string) {
    super(
      `Department ${departmentId} is archived and its knowledge can't be changed.`,
      'DEPARTMENT_ARCHIVED',
    );
  }
}

/** Polis couldn't be asked (503). */
export class PolisUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super(`Seshat: Polis can't be reached right now (${reason}). Try again.`);
  }
}
