import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

export type InstallationStatus = 'active' | 'suspended' | 'deleted';

/** A GitHub App installation, owned by exactly one organization (docs/git.md). */
@Entity({ name: 'installations' })
@Unique('uq_installations_provider_external_id', ['provider', 'externalId'])
@Check('ck_installations_provider', `provider IN ('github')`)
@Check(
  'ck_installations_account_type',
  `account_type IN ('Organization', 'User')`,
)
@Check(
  'ck_installations_repository_selection',
  `repository_selection IN ('all', 'selected')`,
)
@Check(
  'ck_installations_status',
  `status IN ('active', 'suspended', 'deleted')`,
)
// Keyset pagination: an organization's installations, newest first.
@Index('ix_installations_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class InstallationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  provider: 'github';

  /** GitHub's installation ID. */
  @Column({ type: 'text' })
  externalId: string;

  @Column({ type: 'text' })
  accountLogin: string;

  @Column({ type: 'text' })
  accountType: 'Organization' | 'User';

  @Column({ type: 'text' })
  repositorySelection: 'all' | 'selected';

  @Column({ type: 'text' })
  status: InstallationStatus;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  /** Incremented on every change; the `aggregateVersion` of its events. */
  @Column({ type: 'integer', default: 1 })
  version: number;
}
