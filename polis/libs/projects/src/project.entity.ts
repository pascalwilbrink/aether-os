import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { ProjectStatus } from './project-transitions.js';

@Entity({ name: 'projects' })
@Unique('uq_projects_organization_id_slug', ['organizationId', 'slug'])
@Check('ck_projects_status', `status IN ('active', 'archived')`)
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_projects_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class ProjectEntity {
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
  status: ProjectStatus;

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
