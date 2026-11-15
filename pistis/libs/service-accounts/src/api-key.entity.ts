import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { ServiceAccountEntity } from './service-account.entity.js';

/**
 * An API key of a service account. Only its SHA-256 hash is kept: the key
 * is 256 random bits, so a fast hash is enough (no password-style
 * stretching needed), and lookups go straight to the row.
 */
@Entity({ name: 'api_keys' })
@Unique('uq_api_keys_key_hash', ['keyHash'])
@Index('ix_api_keys_service_account_id_created_at_id', [
  'serviceAccountId',
  'createdAt',
  'id',
])
export class ApiKeyEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  serviceAccountId: string;

  @ManyToOne(() => ServiceAccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'service_account_id',
    foreignKeyConstraintName: 'fk_api_keys_service_account_id',
  })
  serviceAccount?: ServiceAccountEntity;

  @Column({ type: 'text' })
  name: string;

  /** The first characters, to recognise a key in lists. */
  @Column({ type: 'text' })
  prefix: string;

  /** SHA-256 of the whole key, hex. */
  @Column({ type: 'text' })
  keyHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
