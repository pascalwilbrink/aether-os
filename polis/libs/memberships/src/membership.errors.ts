import { DomainError } from '@polis/core';

export class MembershipExistsError extends DomainError {
  constructor(subjectType: string, subject: string) {
    super(
      `The ${subjectType} ${subject} is already a member of this organization.`,
      'MEMBERSHIP_EXISTS',
    );
  }
}

/** Removing or demoting the organization's last owner would leave no one to manage owners. */
export class LastOwnerError extends DomainError {
  constructor() {
    super(
      'The organization needs an owner: make someone else an owner first.',
      'LAST_OWNER',
    );
  }
}
