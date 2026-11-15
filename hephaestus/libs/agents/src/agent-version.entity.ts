import { Check, Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

import type { AgentVersionStatus } from './agent-transitions.js';

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
  model: ApiTypes.AgentModelConfiguration;

  @Column({ type: 'jsonb' })
  capabilities: string[];

  @Column({ type: 'jsonb' })
  tools: ApiTypes.AgentToolConfiguration[];

  @Column({ type: 'jsonb' })
  skills: ApiTypes.AgentSkillConfiguration[];

  @Column({ type: 'jsonb' })
  runtime: ApiTypes.AgentRuntimeConfiguration;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
