import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Polis's copy of a Pistis user, from Pistis's user events (`user.created`,
 * `.updated`, `.disabled`, `.enabled`: each the user as they are). Pistis
 * owns users; this copy lets Polis know who exists without calling it.
 */
@Entity({ name: 'users' })
@Check('ck_users_status', `status IN ('active', 'disabled')`)
export class UserEntity {
  /** The user's Pistis `sub`. */
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  displayName: string;

  /** Contact only, as Pistis keeps it; never used to find or link a user. */
  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text' })
  status: 'active' | 'disabled';

  /** When Pistis created the user (the event's `occurredAt`). */
  @Column({ type: 'timestamptz' })
  createdAt: Date;

  /** When Polis recorded it (last changed it). */
  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  /** The user's version in Pistis (the newest event's `aggregateVersion`). */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
