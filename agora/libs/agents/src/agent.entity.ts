import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { AgentStatus } from './agent-transitions.js';

@Entity({ name: 'agents' })
@Check('ck_agents_status', `status IN ('active', 'archived')`)
// Keyset pagination within an organization: newest first, tie-broken by ID.
@Index('ix_agents_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class AgentEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: AgentStatus;

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
