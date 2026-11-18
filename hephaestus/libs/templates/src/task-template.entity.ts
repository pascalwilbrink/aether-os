import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type TaskTemplateStatus = 'active' | 'archived';

/**
 * A reusable definition of a task (docs/tasks.md, Task templates):
 * organization-wide (`projectId` null) or one project's. Its content lives
 * in immutable, numbered versions.
 */
@Entity({ name: 'task_templates' })
@Check('ck_task_templates_status', `status IN ('active', 'archived')`)
// Keyset pagination within an organization, newest first.
@Index('ix_task_templates_organization_id_created_at_id', [
  'organizationId',
  'createdAt',
  'id',
])
export class TaskTemplateEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** Null for an organization-wide template. */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  /**
   * Where it's visible: its project's ID, or `organization`. Lets a
   * project's list (`scope IN (projectId, 'organization')`) be one filter.
   */
  @Column({ type: 'text' })
  scope: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: TaskTemplateStatus;

  @Column({ type: 'integer' })
  latestVersion: number;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
