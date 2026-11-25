import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  OnDomainEvent,
  type DomainEvent,
  type PistisEvents,
} from '@polis/core';

import { UserEntity } from './user.entity.js';

type UserCreated = PistisEvents.PistisEventPayloads['user.created'];

/**
 * Polis's copy of Pistis's users. Each `user.created` from Pistis (through
 * the inbox, so a redelivered message is skipped) becomes a row; a user
 * already there is left as it is, so applying the event twice is harmless.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  @OnDomainEvent('pistis.user.created')
  onUserCreated(event: DomainEvent<UserCreated>): Promise<void> {
    return this.record(event);
  }

  /**
   * Records the user from Pistis's `user.created`, unless already there.
   * Other handlers of the event (persons) call it first, so they find the
   * user whichever handler runs first.
   */
  async record(event: DomainEvent<UserCreated>): Promise<void> {
    const { payload } = event;
    await this.users
      .createQueryBuilder()
      .insert()
      .values({
        id: payload.userId,
        displayName: payload.displayName,
        email: payload.email,
        status: payload.status,
        createdAt: new Date(event.occurredAt),
        receivedAt: new Date(),
      })
      .orIgnore()
      .execute();
  }

  /**
   * The IDs of the users with this email address (case-insensitive). Pistis
   * doesn't keep addresses unique, so there can be more than one.
   */
  async idsWithEmail(email: string): Promise<string[]> {
    const rows = await this.users
      .createQueryBuilder('user')
      .select('user.id', 'id')
      .where('lower(user.email) = lower(:email)', { email })
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }

  /** Whether Polis knows this user. */
  exists(userId: string): Promise<boolean> {
    return this.users.existsBy({ id: userId });
  }
}
