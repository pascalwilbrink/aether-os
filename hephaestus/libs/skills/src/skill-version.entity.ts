import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

/** One version of a skill: its folder's files, never changed. */
@Entity({ name: 'skill_versions' })
@Index('uq_skill_versions_skill_id_version', ['skillId', 'version'], {
  unique: true,
})
export class SkillVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  skillId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  description: string;

  /** Up to 1 MiB: only loaded when asked for (`SkillsService.loadFiles`). */
  @Column({ type: 'jsonb', select: false })
  files?: ApiTypes.SkillFile[];

  @Column({ type: 'integer' })
  fileCount: number;

  @Column({ type: 'integer' })
  sizeBytes: number;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
