import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn } from 'typeorm';

import { UserProviderEntity } from './user-provider.entity.js';

/**
 * The password of a `password` identity: only its scrypt hash. Deleted with
 * the identity.
 */
@Entity({ name: 'password_credentials' })
export class PasswordCredentialEntity {
  @PrimaryColumn({ type: 'uuid' })
  userProviderId: string;

  @OneToOne(() => UserProviderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_provider_id',
    foreignKeyConstraintName: 'fk_password_credentials_user_provider_id',
  })
  userProvider?: UserProviderEntity;

  /** `scrypt$<log2 N>$<r>$<p>$<salt>$<hash>` (base64url). */
  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
