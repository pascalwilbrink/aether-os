import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@ergon/core';

export type WorkItemStatus = ApiTypes.WorkItemStatus;
export type WorkBriefItem = ApiTypes.WorkBriefItem;
export type Actor = ApiTypes.Actor;
export type StoredSource = {
  kind: ApiTypes.WorkItemSourceKind;
  reference: string | null;
};

/**
 * A work item (ergon/CLAUDE.md, WorkItem): one unit of work in an
 * organization, in a project or outside any. Blocked isn't stored: it's
 * derived from the dependencies.
 */
@Entity({ name: 'work_items' })
@Check(
  'ck_work_items_status',
  `status IN ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled')`,
)
@Check(
  'ck_work_items_type',
  `type IN ('task', 'bug', 'feature', 'incident', 'research', 'improvement', 'review', 'initiative')`,
)
@Check(
  'ck_work_items_priority',
  `priority IN ('low', 'medium', 'high', 'urgent')`,
)
// Keyset pagination of a project's work (or the organization's outside any
// project), newest first.
@Index('ix_work_items_scope_created_at_id', [
  'organizationId',
  'scopeId',
  'createdAt',
  'id',
])
// A parent's children.
@Index('ix_work_items_parent_id', ['parentId'])
export class WorkItemEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** Null for work outside any project. */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  /**
   * Its project, or its organization when it has none (kept by Postgres),
   * so listing either is one equality filter.
   */
  @Column({
    type: 'uuid',
    generatedType: 'STORED',
    asExpression: 'COALESCE(project_id, organization_id)',
    insert: false,
    update: false,
  })
  scopeId?: string;

  /** The work item it's part of, in the same project; fixed at creation. */
  @Column({ type: 'uuid', nullable: true })
  parentId: string | null;

  /** The department that owns the work (Polis), if any; the UI sets it. */
  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  /** The team that owns the work (Polis), if any. */
  @Column({ type: 'uuid', nullable: true })
  teamId: string | null;

  @Column({ type: 'text' })
  type: ApiTypes.WorkItemType;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: WorkItemStatus;

  @Column({ type: 'text' })
  priority: ApiTypes.WorkItemPriority;

  /** Reaches `done` only through `in_review`. */
  @Column({ type: 'boolean' })
  needsReview: boolean;

  @Column({ type: 'jsonb' })
  requirements: WorkBriefItem[];

  @Column({ type: 'text', nullable: true })
  expectedOutcome: string | null;

  @Column({ type: 'jsonb' })
  constraints: WorkBriefItem[];

  @Column({ type: 'jsonb' })
  acceptanceCriteria: WorkBriefItem[];

  @Column({ type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'jsonb' })
  source: StoredSource;

  @Column({ type: 'jsonb' })
  createdBy: Actor;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  /** Grows with every change; `If-Match` and events' `aggregateVersion`. */
  @Column({ type: 'integer' })
  version: number;
}
