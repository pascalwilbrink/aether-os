import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@kairos/core';

export type AutomationStatus = ApiTypes.AutomationStatus;

/** A GitHub issue trigger as stored: every optional field filled in. */
export type StoredIssueTrigger = Required<ApiTypes.GitHubIssueTrigger>;
/** A work assignment trigger as stored: every optional field filled in. */
export type StoredWorkTrigger = Required<ApiTypes.WorkAssignedTrigger>;
/** The trigger as stored (`AutomationMapper`). */
export type StoredTrigger = StoredIssueTrigger | StoredWorkTrigger;

/** The action as stored: every optional field filled in. */
export type StoredAction = ApiTypes.AutomationAction &
  Required<
    Pick<
      ApiTypes.AutomationAction,
      'workInRepository' | 'reviewArtifactKinds' | 'concurrency'
    >
  >;

/**
 * An automation (docs/automations.md): a trigger bound to the task an agent
 * runs when it fires, in one project. The trigger and the task are JSON,
 * as the API describes them.
 */
@Entity({ name: 'automations' })
@Check('ck_automations_status', `status IN ('active', 'paused', 'archived')`)
// Keyset pagination: a project's automations, newest first.
@Index('ix_automations_project_id_created_at_id', [
  'projectId',
  'createdAt',
  'id',
])
// Matching an event: an organization's active automations.
@Index('ix_automations_organization_id_status', ['organizationId', 'status'])
export class AutomationEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text' })
  status: AutomationStatus;

  @Column({ type: 'jsonb' })
  trigger: StoredTrigger;

  @Column({ type: 'jsonb' })
  action: StoredAction;

  @Column({ type: 'text' })
  createdBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'integer' })
  version: number;
}
