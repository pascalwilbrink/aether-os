import { DomainError } from '@polis/core';

export class PersonEmailTakenError extends DomainError {
  constructor(email: string) {
    super(
      `A person with the email address ${email} is already in this organization.`,
      'PERSON_EMAIL_TAKEN',
    );
  }
}
