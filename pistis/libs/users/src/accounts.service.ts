import { Injectable } from '@nestjs/common';

import { Transactional, ValidationProblemException } from '@pistis/core';

import type { CreateUserRequest } from './dto/create-user.request.js';
import type { UserResponse } from './dto/user.response.js';
import { PasswordsService } from './passwords.service.js';
import { UserProvidersService } from './user-providers.service.js';
import {
  IdentityAlreadyLinkedError,
  InvalidCredentialsError,
} from './users.errors.js';
import { UsersService } from './users.service.js';

/** What an identity provider tells Pistis about whoever just signed in. */
export interface SignInIdentity {
  /** e.g. `google`, `github`, `entra:<tenant id>`. */
  provider: string;
  /** The provider's stable ID for the account (OIDC `sub`). */
  subject: string;
  email: string | null;
  emailVerified: boolean;
  /** For a user created by this sign-in. */
  displayName: string | null;
}

export interface SignInResult {
  user: UserResponse;
  /** True when this sign-in created the user. */
  created: boolean;
}

/**
 * Users together with their identities: creating a user with a first
 * identity, and resolving a sign-in to a user.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly users: UsersService,
    private readonly providers: UserProvidersService,
    private readonly passwords: PasswordsService,
  ) {}

  /**
   * A user who can sign in from the start, through their first identity:
   * an external one (`provider`) or a password (`password`), exactly one.
   */
  @Transactional()
  async createUser(dto: CreateUserRequest): Promise<UserResponse> {
    if (Boolean(dto.provider) === Boolean(dto.password)) {
      throw new ValidationProblemException([
        {
          pointer: dto.provider ? '/password' : '/provider',
          parameter: null,
          code: dto.provider ? 'INVALID' : 'REQUIRED',
          detail: 'Give exactly one of provider and password.',
        },
      ]);
    }
    const user = await this.users.create({
      displayName: dto.displayName,
      email: dto.email,
    });
    if (dto.password) {
      await this.passwords.setUp(user.id, dto.password);
    } else if (dto.provider) {
      await this.providers.link(user.id, dto.provider);
    }

    return user;
  }

  /**
   * Signs in with a login and password: the user, or `INVALID_CREDENTIALS`
   * without saying which part was wrong (`USER_DISABLED` for a disabled
   * user with the right password). Not exposed over HTTP: the sign-in page
   * calls it.
   */
  @Transactional()
  async signInWithPassword(
    login: string,
    password: string,
  ): Promise<UserResponse> {
    const identity = await this.passwords.verify(login, password);
    if (!identity) {
      throw new InvalidCredentialsError();
    }
    const now = new Date();
    const user = await this.users.recordSignIn(identity.userId, now);
    await this.providers.recordSignIn(
      identity.id,
      { email: identity.email, emailVerified: identity.emailVerified },
      now,
    );

    return user;
  }

  /**
   * Resolves a sign-in through an external provider to a Pistis user:
   *
   * - an identity linked to a user signs that user in (`USER_DISABLED` if
   *   they're disabled);
   * - an identity seen for the first time gets a new user, linked to it.
   *
   * Never by email address (docs/identity.md): an email that matches an
   * existing user still gets a new user. Joining another identity to an
   * existing user is an explicit link by a signed-in user.
   *
   * Not exposed over HTTP: Pistis's sign-in flow calls it after the
   * provider has authenticated the person.
   */
  async resolveSignIn(identity: SignInIdentity): Promise<SignInResult> {
    try {
      return await this.signIn(identity);
    } catch (error) {
      // Two first sign-ins with the same identity at once: the other one
      // created the user, so this one finds the link now.
      if (error instanceof IdentityAlreadyLinkedError) {
        return this.signIn(identity);
      }
      throw error;
    }
  }

  @Transactional()
  private async signIn(identity: SignInIdentity): Promise<SignInResult> {
    const now = new Date();
    const linked = await this.providers.findByIdentity(
      identity.provider,
      identity.subject,
    );
    if (linked) {
      const user = await this.users.recordSignIn(linked.userId, now);
      await this.providers.recordSignIn(linked.id, identity, now);
      return { user, created: false };
    }

    const created = await this.users.create({
      displayName: identity.displayName ?? identity.email ?? 'New user',
      email: identity.email,
    });
    const link = await this.providers.link(created.id, {
      provider: identity.provider,
      subject: identity.subject,
      email: identity.email,
      emailVerified: identity.emailVerified,
    });
    const user = await this.users.recordSignIn(created.id, now);
    await this.providers.recordSignIn(link.id, identity, now);

    return { user, created: true };
  }
}
