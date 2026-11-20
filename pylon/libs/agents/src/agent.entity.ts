import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

export type AgentStatus = 'active' | 'archived';

/**
 * Pylon's copy of an Agora agent (from `agora.events`): enough to know an
 * organization has it, for the agent's own keys and budget.
 */
@Entity({ name: 'agents' })
@Check('ck_agents_status', `status IN ('active', 'archived')`)
export class AgentEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  status: AgentStatus;

  /** The last Agora event applied (`aggregateVersion`): older ones are ignored. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
