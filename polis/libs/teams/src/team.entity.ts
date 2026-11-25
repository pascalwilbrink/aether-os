import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/**
 * A team of an organization: persons working together (`TeamMemberEntity`),
 * in any of its departments (`TeamDepartmentEntity`). It grants nothing;
 * roles stay on memberships.
 */
@Entity({ name: 'teams' })
@Unique('uq_teams_organization_id_slug', ['organizationId', 'slug'])
@Check('ck_teams_status', `status IN ('active', 'archived')`)
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_teams_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class TeamEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: 'active' | 'archived';

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
