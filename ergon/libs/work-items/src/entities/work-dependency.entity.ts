import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@ergon/core';

/**
 * A dependency between two work items of one organization (ergon/CLAUDE.md,
 * WorkDependency): `from` blocks `to`, or the two relate (stored with the
 * smaller ID as `from`). Removing one deletes it; its activity stays.
 */
@Entity({ name: 'work_dependencies' })
@Check('ck_work_dependencies_kind', `kind IN ('blocks', 'relates_to')`)
@Check('ck_work_dependencies_distinct', `from_work_item_id <> to_work_item_id`)
@Index(
  'ux_work_dependencies_edge',
  ['fromWorkItemId', 'toWorkItemId', 'kind'],
  { unique: true },
)
// The other side: what blocks a work item (derived Blocked), its dependencies.
@Index('ix_work_dependencies_to', ['toWorkItemId'])
export class WorkDependencyEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'text' })
  kind: ApiTypes.WorkDependencyKind;

  @Column({ type: 'uuid' })
  fromWorkItemId: string;

  @Column({ type: 'uuid' })
  toWorkItemId: string;

  @Column({ type: 'jsonb' })
  createdBy: ApiTypes.Actor;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
