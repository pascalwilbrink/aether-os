import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { UserStatus } from './user-transitions.js';

/** A person, as Pistis knows them. `id` is their `sub` in every token. */
@Entity({ name: 'users' })
@Check('ck_users_status', `status IN ('active', 'disabled')`)
// Keyset pagination: newest first, tie-broken by ID.
@Index('ix_users_created_at_id', ['createdAt', 'id'])
export class UserEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  displayName: string;

  /** Contact only; never used to find or link a user. */
  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'text' })
  status: UserStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSignInAt: Date | null;
}
