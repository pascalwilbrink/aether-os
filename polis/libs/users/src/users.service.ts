import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  OnDomainEvent,
  type DomainEvent,
  type PistisEvents,
} from '@polis/core';

import { UserEntity } from './user.entity.js';

/** Every Pistis user event carries the user as they are (a snapshot). */
export type UserSnapshot = PistisEvents.PistisEventPayloads['user.created'];

/** Pistis's user events Polis consumes (`PISTIS_SUBSCRIPTIONS`). */
export const USER_EVENTS = [
  'user.created',
  'user.updated',
  'user.disabled',
  'user.enabled',
] as const;

/**
 * Polis's copy of Pistis's users. Each user event from Pistis (through the
 * inbox, so a redelivered message is skipped) carries the user as they are
 * at a version: the copy keeps the newest, so events arriving out of order,
 * twice, or again from Pistis's backfill (`POST /v1/users/announce`) change
 * nothing they shouldn't.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  @OnDomainEvent('pistis.user.created')
  onUserCreated(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.record(event);
  }

  @OnDomainEvent('pistis.user.updated')
  onUserUpdated(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.record(event);
  }

  @OnDomainEvent('pistis.user.disabled')
  onUserDisabled(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.record(event);
  }

  @OnDomainEvent('pistis.user.enabled')
  onUserEnabled(event: DomainEvent<UserSnapshot>): Promise<void> {
    return this.record(event);
  }

  /**
   * Records the user from one of Pistis's user events: a new row, or the
   * row replaced when the event is newer than what's there. Other handlers
   * of the events (persons) call it first, so they find the user as the
   * event has it whichever handler runs first.
   */
  async record(event: DomainEvent<UserSnapshot>): Promise<void> {
    const { payload } = event;
    const now = new Date();
    await this.users
      .createQueryBuilder('copy')
      .insert()
      .values({
        id: payload.userId,
        displayName: payload.displayName,
        email: payload.email,
        status: payload.status,
        // When Pistis created the user: this event's time only for
        // `user.created`; a first sight through a later event (the backfill)
        // has no better one.
        createdAt: new Date(event.occurredAt),
        receivedAt: now,
        version: event.aggregateVersion,
      })
      .orUpdate(
        ['display_name', 'email', 'status', 'received_at', 'version'],
        ['id'],
        { overwriteCondition: { where: 'copy.version < EXCLUDED.version' } },
      )
      .execute();
  }

  /** The user as Polis has them, or null. */
  find(userId: string): Promise<UserEntity | null> {
    return this.users.findOneBy({ id: userId });
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
