import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

import type { TemplateContent } from './template-content.js';

/** One version of a template, as written; never changes. */
@Entity({ name: 'task_template_versions' })
@Unique('uq_task_template_versions_template_id_version', [
  'templateId',
  'version',
])
// Keyset pagination: a template's versions, newest first.
@Index('ix_task_template_versions_template_id_created_at_id', [
  'templateId',
  'createdAt',
  'id',
])
export class TaskTemplateVersionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  templateId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'integer' })
  version: number;

  /** As written; its effective content is computed (it may extend another). */
  @Column({ type: 'jsonb' })
  content: TemplateContent;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
