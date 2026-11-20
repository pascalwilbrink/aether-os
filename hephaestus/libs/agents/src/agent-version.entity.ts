import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { AgentVersion } from '@hephaestus/core';

export type AgentVersionStatus = 'draft' | 'published' | 'deprecated';

/**
 * Hephaestus's copy of an Agora agent version: every version Agora
 * published (`agent-version.published` carries the whole version, which
 * never changes), so tasks can pin it and the runner can run it.
 */
@Entity({ name: 'agent_versions' })
@Unique('uq_agent_versions_agent_id_version', ['agentId', 'version'])
@Check(
  'ck_agent_versions_status',
  `status IN ('draft', 'published', 'deprecated')`,
)
@Check('ck_agent_versions_version', 'version >= 1')
// Keyset pagination per agent: highest version first.
@Index('ix_agent_versions_agent_id_version_id', ['agentId', 'version', 'id'])
export class AgentVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  status: AgentVersionStatus;

  @Column({ type: 'text' })
  instructions: string;

  @Column({ type: 'jsonb' })
  model: AgentVersion['model'];

  @Column({ type: 'jsonb' })
  capabilities: string[];

  @Column({ type: 'jsonb' })
  tools: AgentVersion['tools'];

  @Column({ type: 'jsonb' })
  skills: AgentVersion['skills'];

  @Column({ type: 'jsonb' })
  runtime: AgentVersion['runtime'];

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
