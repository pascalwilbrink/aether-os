import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * oidc-provider's state: sessions, interactions, authorization codes,
 * grants, refresh tokens (JWT access tokens aren't stored). One row per
 * model instance, the payload as oidc-provider gives it.
 */
@Entity({ name: 'oidc_payloads' })
@Index('ix_oidc_payloads_grant_id', ['grantId'])
@Index('ix_oidc_payloads_uid', ['uid'])
@Index('ix_oidc_payloads_expires_at', ['expiresAt'])
export class OidcPayloadEntity {
  /** The model: `Session`, `Grant`, `AuthorizationCode`, … */
  @PrimaryColumn({ type: 'text' })
  kind: string;

  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  grantId: string | null;

  @Column({ type: 'text', nullable: true })
  uid: string | null;

  @Column({ type: 'text', nullable: true })
  userCode: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt: Date | null;
}
