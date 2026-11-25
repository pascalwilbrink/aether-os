import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type DeliberationRoundStatus = 'open' | 'concluded';

/**
 * One round of a council's discussion (../../../../docs/councils.md,
 * Deliberation rounds): the facilitator's question, the members who
 * answered, in order, and its conclusion.
 */
@Entity({ name: 'deliberation_rounds' })
@Check('ck_deliberation_rounds_status', `status IN ('open', 'concluded')`)
@Index('uq_deliberation_rounds_session_id_number', ['sessionId', 'number'], {
  unique: true,
})
export class DeliberationRoundEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  question: string;

  /** Agent IDs, in the order they answered. */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  participants: string[];

  @Column({ type: 'text' })
  status: DeliberationRoundStatus;

  @Column({ type: 'text', nullable: true })
  conclusion: string | null;

  @Column({ type: 'timestamptz' })
  openedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  concludedAt: Date | null;
}
