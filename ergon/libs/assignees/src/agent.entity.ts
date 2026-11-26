import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * An agent of an organization, as Agora announces it (`agent.created`,
 * `agent.archived`): the agents work can be assigned to. Agora owns them;
 * this copy is guarded by Agora's `version`.
 */
@Entity({ name: 'agents' })
@Check('ck_agents_status', `status IN ('active', 'archived')`)
@Index('ix_agents_organization_id', ['organizationId'])
export class AgentEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** Empty when the archiving arrived before the creation. */
  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  status: 'active' | 'archived';

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;
}
