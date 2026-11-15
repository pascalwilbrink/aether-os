import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { Transactional } from '@pistis/core';

import type { ChangePasswordRequest } from './dto/change-password.request.js';
import type { PasswordIdentityRequest } from './dto/password-identity.request.js';
import type { UserProviderResponse } from './dto/user-provider.response.js';
import { PasswordCredentialEntity } from './password-credential.entity.js';
import { PasswordHasher } from './password-hasher.js';
import { UserProvidersService } from './user-providers.service.js';
import { PasswordAlreadySetError } from './users.errors.js';

/** The `password` identity provider: Pistis's own logins and passwords. */
export const PASSWORD_PROVIDER = 'password';

/** Logins are compared lowercase and without surrounding spaces. */
export function normalizeLogin(login: string): string {
  return login.trim().toLowerCase();
}

/** Passwords of `password` identities. */
@Injectable()
export class PasswordsService {
  constructor(
    @InjectRepository(PasswordCredentialEntity)
    private readonly credentials: Repository<PasswordCredentialEntity>,
    private readonly hasher: PasswordHasher,
    private readonly providers: UserProvidersService,
  ) {}

  /** Gives a user a password identity (`PASSWORD_ALREADY_SET` if they have one). */
  @Transactional()
  async setUp(
    userId: string,
    dto: PasswordIdentityRequest,
  ): Promise<UserProviderResponse> {
    // Hash first: slow, and nothing is locked yet.
    const passwordHash = await this.hasher.hash(dto.password);
    if (await this.providers.findForUser(userId, PASSWORD_PROVIDER)) {
      throw new PasswordAlreadySetError(userId);
    }
    const identity = await this.providers.linkInternal(userId, {
      provider: PASSWORD_PROVIDER,
      subject: normalizeLogin(dto.login),
      email: null,
      emailVerified: false,
    });
    await this.credentials.insert({
      userProviderId: identity.id,
      passwordHash,
      updatedAt: new Date(),
    });

    return identity;
  }

  /** Replaces the password; 404 when the user has no password identity. */
  @Transactional()
  async change(userId: string, dto: ChangePasswordRequest): Promise<void> {
    const passwordHash = await this.hasher.hash(dto.password);
    const identity = await this.providers.findForUser(
      userId,
      PASSWORD_PROVIDER,
    );
    if (!identity) {
      throw new NotFoundException(`User ${userId} has no password`);
    }
    await this.credentials.update(
      { userProviderId: identity.id },
      { passwordHash, updatedAt: new Date() },
    );
  }

  /**
   * The password identity a login and password belong to, or null. Takes
   * as long for an unknown login as for a wrong password.
   */
  async verify(
    login: string,
    password: string,
  ): Promise<UserProviderResponse | null> {
    const identity = await this.providers.findByIdentity(
      PASSWORD_PROVIDER,
      normalizeLogin(login),
    );
    const credential = identity
      ? await this.credentials.findOneBy({ userProviderId: identity.id })
      : null;
    if (!identity || !credential) {
      await this.hasher.verifyNothing(password);
      return null;
    }

    return (await this.hasher.verify(password, credential.passwordHash))
      ? identity
      : null;
  }
}
