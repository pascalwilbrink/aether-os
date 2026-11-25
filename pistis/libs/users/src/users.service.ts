import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThan, type Repository } from 'typeorm';

import {
  findPage,
  mapPage,
  PistisEvents,
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

/** How many users one transaction of `announce` publishes. */
const ANNOUNCE_BATCH = 500;

/**
 * Users: their profile and status. Linked identities: `UserProvidersService`.
 * Every change other services hear of bumps `version` and publishes the
 * user's state (`user.created`, `.updated`, `.disabled`, `.enabled`) to the
 * outbox in the same transaction.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly mapper: UserMapper,
    private readonly events: PistisEvents,
  ) {}

  /**
   * A new user without identities; `AccountsService` links the first one.
   * `user.created` goes to the outbox in the same transaction, so other
   * services (Polis) learn of every user that exists.
   */
  @Transactional()
  async create(user: NewUser): Promise<UserResponse> {
    const entity = this.mapper.toEntity(user, new Date());
    await this.users.insert(entity);
    await this.publish('user.created', entity);

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
    const before = { displayName: entity.displayName, email: entity.email };
    this.mapper.applyTo(entity, dto, new Date());
    if (
      before.displayName === entity.displayName &&
      before.email === entity.email
    ) {
      // Nothing changed: no new version, no event.
      return this.mapper.toResponse(await this.load(userId));
    }
    entity.version += 1;
    await this.users.save(entity);
    await this.publish('user.updated', entity);

    return this.mapper.toResponse(entity);
  }

  /**
   * Publishes every user's current state as `user.updated`, at their
   * current version (the backfill: `POST /v1/users/announce`). In batches,
   * each its own transaction; how many were published.
   */
  async announce(): Promise<number> {
    let announced = 0;
    let after: string | null = null;
    for (;;) {
      const batch = await this.announceBatch(after);
      announced += batch.count;
      if (!batch.last) {
        return announced;
      }
      after = batch.last;
    }
  }

  @Transactional()
  private async announceBatch(
    after: string | null,
  ): Promise<{ count: number; last: string | null }> {
    const entities = await this.users.find({
      where: after ? { id: MoreThan(after) } : {},
      order: { id: 'ASC' },
      take: ANNOUNCE_BATCH,
    });
    for (const entity of entities) {
      await this.publish('user.updated', entity);
    }
    return {
      count: entities.length,
      last:
        entities.length === ANNOUNCE_BATCH
          ? entities[entities.length - 1].id
          : null,
    };
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
      entity.version += 1;
      await this.users.save(entity);
      await this.publish(
        next === 'disabled' ? 'user.disabled' : 'user.enabled',
        entity,
      );
    }

    return this.mapper.toResponse(entity);
  }

  /**
   * One of the user's events, with their whole current state (a snapshot)
   * at their version, in the caller's transaction (the outbox).
   */
  private async publish(
    eventType:
      'user.created' | 'user.updated' | 'user.disabled' | 'user.enabled',
    entity: UserEntity,
  ): Promise<void> {
    await this.events.emit({
      eventType,
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      payload: {
        userId: entity.id,
        displayName: entity.displayName,
        email: entity.email,
        status: entity.status,
      },
    });
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
