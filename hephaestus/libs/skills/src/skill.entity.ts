import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type SkillStatus = 'active' | 'archived';

/**
 * Hephaestus's copy of one of Agora's skills (from `agora.events`): its
 * name, status and latest version; the versions, never changed, are
 * `skill_versions`.
 */
@Entity({ name: 'skills' })
@Check('ck_skills_status', `status IN ('active', 'archived')`)
@Index('uq_skills_organization_id_name', ['organizationId', 'name'], {
  unique: true,
})
export class SkillEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  /** The latest version's. */
  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: SkillStatus;

  /** 0 until its first version's event is in. */
  @Column({ type: 'integer' })
  latestVersion: number;

  /**
   * The last event applied (its `aggregateVersion`): an event that isn't
   * newer changes nothing. Rows from before Agora owned skills are 1, as
   * Agora's import starts them.
   */
  @Column({ type: 'integer' })
  revision: number;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
