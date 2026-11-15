import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { UserEntity } from './user.entity.js';

/**
 * An external identity linked to a user: whoever signs in at `provider` as
 * `subject` is this user. Any number of providers can link to one user; an
 * identity belongs to at most one.
 */
@Entity({ name: 'user_providers' })
@Unique('uq_user_providers_provider_subject', ['provider', 'subject'])
// Listing a user's identities: oldest first.
@Index('ix_user_providers_user_id_created_at_id', ['userId', 'createdAt', 'id'])
export class UserProviderEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'fk_user_providers_user_id',
  })
  user?: UserEntity;

  /** e.g. `google`, `github`, `entra:<tenant id>`. */
  @Column({ type: 'text' })
  provider: string;

  /** The provider's stable ID for the account (OIDC `sub`), never an email. */
  @Column({ type: 'text' })
  subject: string;

  /** As the provider last reported it; informational. */
  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ type: 'boolean' })
  emailVerified: boolean;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  lastSignInAt: Date | null;
}
