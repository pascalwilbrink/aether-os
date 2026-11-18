import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  Transactional,
  type Page,
  type PageRequest,
} from '@pistis/core';

import type { UpdateUserRequest } from './dto/update-user.request.js';
import type { UserResponse } from './dto/user.response.js';
import {
  nextUserStatus,
  userCanSignIn,
  type UserAction,
} from './user-transitions.js';
import { UserEntity } from './user.entity.js';
import { UserMapper, type NewUser } from './user.mapper.js';
import { UserDisabledError } from './users.errors.js';

/** Users: their profile and status. Linked identities: `UserProvidersService`. */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly mapper: UserMapper,
  ) {}

  /** A new user without identities; `AccountsService` links the first one. */
  @Transactional()
  async create(user: NewUser): Promise<UserResponse> {
    const entity = this.mapper.toEntity(user, new Date());
    await this.users.insert(entity);

    return this.mapper.toResponse(entity);
  }

  async list(page: PageRequest): Promise<Page<UserResponse>> {
    const entities = await findPage(
      this.users,
      { where: {}, sortBy: 'createdAt', direction: 'DESC' },
      page,
    );

    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  /** The users with these IDs that exist, in no particular order. */
  async findByIds(userIds: string[]): Promise<UserResponse[]> {
    if (userIds.length === 0) {
      return [];
    }
    const entities = await this.users.findBy({ id: In(userIds) });

    return entities.map((entity) => this.mapper.toResponse(entity));
  }

  async findById(userId: string): Promise<UserResponse> {
    return this.mapper.toResponse(await this.load(userId));
  }

  @Transactional()
  async update(userId: string, dto: UpdateUserRequest): Promise<UserResponse> {
    const entity = await this.load(userId, true);
    await this.users.save(this.mapper.applyTo(entity, dto, new Date()));

    return this.mapper.toResponse(entity);
  }

  disable(userId: string): Promise<UserResponse> {
    return this.apply(userId, 'disable');
  }

  enable(userId: string): Promise<UserResponse> {
    return this.apply(userId, 'enable');
  }

  /**
   * Locks the user row until the caller's transaction ends, so changes to
   * the user's identities (linking, unlinking the last one) take turns.
   * 404 unless the user exists.
   */
  @Transactional()
  async lock(userId: string): Promise<void> {
    await this.load(userId, true);
  }

  /** Records a sign-in; `USER_DISABLED` for a disabled user. */
  @Transactional()
  async recordSignIn(userId: string, now: Date): Promise<UserResponse> {
    const entity = await this.load(userId, true);
    if (!userCanSignIn(entity.status)) {
      throw new UserDisabledError(userId);
    }
    entity.lastSignInAt = now;
    await this.users.save(entity);

    return this.mapper.toResponse(entity);
  }

  @Transactional()
  private async apply(
    userId: string,
    action: UserAction,
  ): Promise<UserResponse> {
    const entity = await this.load(userId, true);
    const next = nextUserStatus(entity.status, action);
    if (next !== entity.status) {
      entity.status = next;
      entity.updatedAt = new Date();
      await this.users.save(entity);
    }

    return this.mapper.toResponse(entity);
  }

  private async load(userId: string, forUpdate = false): Promise<UserEntity> {
    const entity = await this.users.findOne({
      where: { id: userId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return entity;
  }
}
