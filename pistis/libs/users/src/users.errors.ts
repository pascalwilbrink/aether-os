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

export class PasswordAlreadySetError extends DomainError {
  constructor(userId: string) {
    super(
      `User ${userId} has a password already; change it instead.`,
      'PASSWORD_ALREADY_SET',
    );
  }
}

export class PasswordProviderReservedError extends DomainError {
  constructor() {
    super(
      'Password identities are set up with POST /v1/users/{userId}/password.',
      'PASSWORD_PROVIDER_RESERVED',
    );
  }
}

/** A login and password that don't match (internal; never says which part was wrong). */
export class InvalidCredentialsError extends DomainError {
  constructor() {
    super('The login or password is wrong.', 'INVALID_CREDENTIALS');
  }
}

/** Sign-in by a disabled user (internal: the sign-in flow turns it into its own answer). */
export class UserDisabledError extends DomainError {
  constructor(userId: string) {
    super(`User ${userId} is disabled.`, 'USER_DISABLED');
  }
}
