import { DomainError } from '@pistis/core';

export class IdentityAlreadyLinkedError extends DomainError {
  constructor(provider: string) {
    super(
      `This ${provider} identity is already linked to a user.`,
      'IDENTITY_ALREADY_LINKED',
    );
  }
}

export class UserLastProviderError extends DomainError {
  constructor(userId: string) {
    super(
      `User ${userId} has no other way to sign in; link another identity first.`,
      'USER_LAST_PROVIDER',
    );
  }
}

/** Sign-in by a disabled user (internal: the sign-in flow turns it into its own answer). */
export class UserDisabledError extends DomainError {
  constructor(userId: string) {
    super(`User ${userId} is disabled.`, 'USER_DISABLED');
  }
}
