import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { CouncilStatus } from './council-transitions.js';

/** A council (../../../../docs/councils.md): a named team of the organization's agents. */
@Entity({ name: 'councils' })
@Unique('uq_councils_organization_id_key', ['organizationId', 'key'])
@Check('ck_councils_status', `status IN ('active', 'archived')`)
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_councils_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class CouncilEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  key: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: CouncilStatus;

  /** The published version, if any. */
  @Column({ type: 'uuid', nullable: true })
  latestVersionId: string | null;

  /** Grows by one with each change: its events' `aggregateVersion`. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
