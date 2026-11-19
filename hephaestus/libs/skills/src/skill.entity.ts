import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

export type SkillStatus = ApiTypes.SkillStatus;

/**
 * An organization's skill (the Agent Skills format): its name and its
 * latest version; the versions, never changed, are `skill_versions`.
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

  @Column({ type: 'integer' })
  latestVersion: number;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
