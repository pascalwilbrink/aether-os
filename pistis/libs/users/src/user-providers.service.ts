import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  findPage,
  isUniqueViolation,
  mapPage,
  Transactional,
  type Page,
  type PageRequest,
} from '@pistis/core';

import type { LinkUserProviderRequest } from './dto/link-user-provider.request.js';
import type { UserProviderResponse } from './dto/user-provider.response.js';
import { UserProviderEntity } from './user-provider.entity.js';
import { UserProviderMapper } from './user-provider.mapper.js';
import {
  IdentityAlreadyLinkedError,
  PasswordProviderReservedError,
  UserLastProviderError,
} from './users.errors.js';
import { UsersService } from './users.service.js';

/** The external identities linked to users. */
@Injectable()
export class UserProvidersService {
  constructor(
    @InjectRepository(UserProviderEntity)
    private readonly providers: Repository<UserProviderEntity>,
    private readonly mapper: UserProviderMapper,
    private readonly users: UsersService,
  ) {}

  /**
   * Links an external identity to a user (`IDENTITY_ALREADY_LINKED` if it's
   * anyone's). Not for `password`, which needs a credential: see
   * `PasswordsService.setUp`.
   */
  async link(
    userId: string,
    dto: LinkUserProviderRequest,
  ): Promise<UserProviderResponse> {
    if (dto.provider === 'password') {
      throw new PasswordProviderReservedError();
    }
    return this.linkInternal(userId, dto);
  }

  /** Links any identity, `password` included (for `PasswordsService`). */
  @Transactional()
  async linkInternal(
    userId: string,
    dto: LinkUserProviderRequest,
  ): Promise<UserProviderResponse> {
    await this.users.lock(userId);

    const entity = this.mapper.toEntity(dto, userId, new Date());
    try {
      await this.providers.insert(entity);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdentityAlreadyLinkedError(dto.provider);
      }
      throw error;
    }

    return this.mapper.toResponse(entity);
  }

  async list(
    userId: string,
    page: PageRequest,
  ): Promise<Page<UserProviderResponse>> {
    await this.users.findById(userId);

    const entities = await findPage(
      this.providers,
      { where: { userId }, sortBy: 'createdAt', direction: 'ASC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  /** Unlinks an identity, unless it's the user's last (`USER_LAST_PROVIDER`). */
  @Transactional()
  async unlink(userId: string, userProviderId: string): Promise<void> {
    // The user lock makes concurrent unlinks take turns, so two of them
    // can't both see "another identity is left".
    await this.users.lock(userId);

    const entity = await this.providers.findOneBy({
      id: userProviderId,
      userId,
    });
    if (!entity) {
      throw new NotFoundException(`Identity ${userProviderId} not found`);
    }
    if ((await this.providers.countBy({ userId })) <= 1) {
      throw new UserLastProviderError(userId);
    }
    await this.providers.remove(entity);
  }

  /** The user's identity at a provider, if any. */
  async findForUser(
    userId: string,
    provider: string,
  ): Promise<UserProviderResponse | null> {
    const entity = await this.providers.findOneBy({ userId, provider });

    return entity ? this.mapper.toResponse(entity) : null;
  }

  /** The link for an identity, if any (for sign-in). */
  async findByIdentity(
    provider: string,
    subject: string,
  ): Promise<UserProviderResponse | null> {
    const entity = await this.providers.findOneBy({ provider, subject });

    return entity ? this.mapper.toResponse(entity) : null;
  }

  /** Records a sign-in through an identity, with the email the provider reports now. */
  @Transactional()
  async recordSignIn(
    userProviderId: string,
    profile: { email: string | null; emailVerified: boolean },
    now: Date,
  ): Promise<void> {
    await this.providers.update(
      { id: userProviderId },
      {
        email: profile.email,
        emailVerified: profile.emailVerified,
        lastSignInAt: now,
      },
    );
  }
}
