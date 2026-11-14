import { Column, Entity, PrimaryColumn, Unique } from 'typeorm';

import type {
  AgentModelConfiguration,
  AgentRuntimeConfiguration,
  AgentSkillConfiguration,
  AgentToolConfiguration,
  AgentVersionStatus,
} from '../../../domain/agent-version.js';

@Entity({ name: 'agent_versions' })
@Unique('UQ_agent_versions_agent_id_version', ['agentId', 'version'])
export class AgentVersionEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  agentId: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  instructions: string;

  @Column({ type: 'simple-json' })
  model: AgentModelConfiguration;

  @Column({ type: 'simple-json' })
  capabilities: string[];

  @Column({ type: 'simple-json' })
  tools: AgentToolConfiguration[];

  @Column({ type: 'simple-json' })
  skills: AgentSkillConfiguration[];

  @Column({ type: 'simple-json' })
  runtime: AgentRuntimeConfiguration;

  @Column({ type: 'varchar' })
  status: AgentVersionStatus;

  @Column({ type: 'varchar' })
  createdBy: string;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;
}
