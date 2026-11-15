import { DomainError } from '@polis/core';

export class MembershipExistsError extends DomainError {
  constructor(subjectType: string, subject: string) {
    super(
      `The ${subjectType} ${subject} is already a member of this organization.`,
      'MEMBERSHIP_EXISTS',
    );
  }
}
