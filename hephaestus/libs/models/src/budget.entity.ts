import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { ApiTypes } from '@hephaestus/core';

export type BudgetScope = ApiTypes.BudgetScope;

/**
 * A limit on what model calls may cost (docs/models.md, Budgets): an
 * organization's or a project's per calendar month (UTC), or a task tree's
 * over its life (`scopeId` is its top-level task). What was spent isn't
 * stored: it's summed from `model_calls`.
 */
@Entity({ name: 'budgets' })
@Check('ck_budgets_scope', `scope IN ('organization', 'project', 'task_tree')`)
@Index('uq_budgets_scope_scope_id', ['scope', 'scopeId'], { unique: true })
export class BudgetEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  /** The project, for a project's or a task tree's budget. */
  @Column({ type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'text' })
  scope: BudgetScope;

  /** The organization, project or top-level task. */
  @Column({ type: 'uuid' })
  scopeId: string;

  /** US dollars; null: no limit. */
  @Column({ type: 'numeric', precision: 18, scale: 6, nullable: true })
  limitUsd: string | null;

  /**
   * The window (`2026-11`, or `lifetime`) whose threshold was announced
   * (`budget.threshold-reached`), so it's published once per window.
   */
  @Column({ type: 'text', nullable: true })
  thresholdWindow: string | null;

  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'text' })
  updatedBy: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz' })
  updatedAt: Date;
}
