import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { DepartmentStatus } from './department.types.js';

/**
 * An optional group in an organization: projects (each in at most one) and
 * people (department members). It grants nothing; roles stay on
 * organization and project memberships.
 */
@Entity({ name: 'departments' })
@Unique('uq_departments_organization_id_slug', ['organizationId', 'slug'])
@Check('ck_departments_status', `status IN ('active', 'archived')`)
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_departments_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class DepartmentEntity {
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
  status: DepartmentStatus;

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
