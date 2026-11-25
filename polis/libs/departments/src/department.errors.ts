import { DomainError } from '@polis/core';

export class DepartmentSlugTakenError extends DomainError {
  constructor(slug: string) {
    super(
      `Slug "${slug}" is already in use by a department of this organization.`,
      'DEPARTMENT_SLUG_TAKEN',
    );
  }
}

export class DepartmentArchivedError extends DomainError {
  constructor(departmentId: string) {
    super(`Department ${departmentId} is archived.`, 'DEPARTMENT_ARCHIVED');
  }
}

/** Thrown by Polis's projects while a department being archived still has active projects. */
export class DepartmentHasProjectsError extends DomainError {
  constructor(departmentId: string, count: number) {
    super(
      `Department ${departmentId} still has ${count} active project${count === 1 ? '' : 's'}; move them out first.`,
      'DEPARTMENT_HAS_PROJECTS',
    );
  }
}
