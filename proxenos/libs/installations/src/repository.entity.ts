import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

export type RepositoryStatus = 'available' | 'removed';

/** A repository an installation covers (or covered: `removed`). */
@Entity({ name: 'repositories' })
@Unique('uq_repositories_installation_id_external_id', [
  'installationId',
  'externalId',
])
@Check('ck_repositories_status', `status IN ('available', 'removed')`)
// Keyset pagination: an organization's available repositories by name.
@Index('ix_repositories_organization_id_status_full_name_id', [
  'organizationId',
  'status',
  'fullName',
  'id',
])
export class RepositoryEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  installationId: string;

  /** GitHub's repository ID (stable across renames). */
  @Column({ type: 'text' })
  externalId: string;

  /** `owner/name`, as GitHub last reported it. */
  @Column({ type: 'text' })
  fullName: string;

  @Column({ type: 'text' })
  defaultBranch: string;

  @Column({ type: 'boolean' })
  private: boolean;

  @Column({ type: 'text' })
  status: RepositoryStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
