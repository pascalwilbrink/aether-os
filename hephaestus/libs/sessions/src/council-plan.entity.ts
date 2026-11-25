import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

import type { PlanEntry, PlanMilestone, PlanStatus } from './plans.js';

export interface PlanReview {
  decision: 'approved' | 'rejected' | 'changes_requested';
  comment: string | null;
  decidedBy: string;
  decidedAt: string;
}

/**
 * A plan a council's facilitator proposed in a session
 * (../../../../docs/councils.md, Planning and delegation), and what the
 * person decided; an approved one records the plan task it became.
 */
@Entity({ name: 'council_plans' })
@Check(
  'ck_council_plans_status',
  `status IN ('proposed', 'approved', 'rejected', 'changes_requested', 'superseded')`,
)
@Index('uq_council_plans_session_id_number', ['sessionId', 'number'], {
  unique: true,
})
export class CouncilPlanEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  status: PlanStatus;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  summary: string;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  milestones: PlanMilestone[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  entries: PlanEntry[];

  @Column({ type: 'text' })
  outcomeEntryKey: string;

  @Column({ type: 'jsonb', nullable: true })
  review: PlanReview | null;

  /** The plan task an approved plan became. */
  @Column({ type: 'uuid', nullable: true })
  taskId: string | null;

  @Column({ type: 'timestamptz' })
  proposedAt: Date;
}
