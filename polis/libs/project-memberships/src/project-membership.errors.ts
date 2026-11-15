import { DomainError } from '@polis/core';

export class ProjectMembershipExistsError extends DomainError {
  constructor(subjectType: string, subject: string) {
    super(
      `The ${subjectType} ${subject} already has a role in this project.`,
      'PROJECT_MEMBERSHIP_EXISTS',
    );
  }
}

export class ProjectMemberNotInOrganizationError extends DomainError {
  constructor(subjectType: string, subject: string) {
    super(
      `The ${subjectType} ${subject} is not a member of this organization.`,
      'PROJECT_MEMBER_NOT_IN_ORGANIZATION',
    );
  }
}

export class ProjectRoleExceedsCapError extends DomainError {
  constructor(role: string, cap: string) {
    super(
      `The role ${role} exceeds what this principal can be granted (at most ${cap}).`,
      'PROJECT_ROLE_EXCEEDS_CAP',
    );
  }
}
