import { Check, Column, Entity, PrimaryColumn } from 'typeorm';

/** Hephaestus's copy of a project's status in Polis. */
@Entity({ name: 'project_states' })
@Check('ck_project_states_status', `status IN ('active', 'archived')`)
export class ProjectStateEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  status: 'active' | 'archived';

  /** Polis's version of the project; older events are ignored. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'timestamptz' })
  syncedAt: Date;
}
