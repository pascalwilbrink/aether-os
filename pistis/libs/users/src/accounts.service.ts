import { Injectable } from '@nestjs/common';

import { Transactional } from '@pistis/core';

import type { CreateUserRequest } from './dto/create-user.request.js';
import type { UserResponse } from './dto/user.response.js';
import { UserProvidersService } from './user-providers.service.js';
import { IdentityAlreadyLinkedError } from './users.errors.js';
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
  ) {}

  /** A user who can sign in from the start, through their first identity. */
  @Transactional()
  async createUser(dto: CreateUserRequest): Promise<UserResponse> {
    const user = await this.users.create({
      displayName: dto.displayName,
      email: dto.email,
    });
    await this.providers.link(user.id, dto.provider);

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
