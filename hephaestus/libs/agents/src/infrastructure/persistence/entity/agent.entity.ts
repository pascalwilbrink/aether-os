import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { AgentStatus } from '../../../domain/agent.js';

@Entity({ name: 'agents' })
@Index(['organizationId', 'id'])
export class AgentEntity {
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  @Column({ type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar' })
  status: AgentStatus;

  @Column({ type: 'varchar', nullable: true })
  latestVersionId: string | null;

  @Column({ type: 'varchar' })
  createdBy: string;

  @Column({ type: 'datetime' })
  createdAt: Date;

  @Column({ type: 'datetime' })
  updatedAt: Date;
}
