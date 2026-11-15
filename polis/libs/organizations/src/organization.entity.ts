import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { OrganizationStatus } from './organization-transitions.js';

@Entity({ name: 'organizations' })
@Unique('uq_organizations_slug', ['slug'])
@Check('ck_organizations_status', `status IN ('active', 'suspended')`)
// Keyset pagination: newest first, tie-broken by ID.
@Index('ix_organizations_created_at_id', ['createdAt', 'id'])
export class OrganizationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  slug: string;

  @Column({ type: 'text' })
  status: OrganizationStatus;

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
