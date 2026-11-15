import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type ServiceAccountStatus = 'active' | 'disabled';

/**
 * An identity that isn't a person (docs/identity.md, Principals): what an
 * automation or an integration acts as, in one organization. `id` is its
 * `sub`; its roles are Polis memberships with `subjectType: service_account`.
 */
@Entity({ name: 'service_accounts' })
@Check('ck_service_accounts_status', `status IN ('active', 'disabled')`)
@Index('ix_service_accounts_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class ServiceAccountEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: ServiceAccountStatus;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
