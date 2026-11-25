import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * What a council's facilitator wrote to close a discussion
 * (../../../../docs/councils.md, Synthesis): what was asked, concluded,
 * decided, and what's open, with the rounds it sums up.
 */
@Entity({ name: 'session_syntheses' })
@Index('uq_session_syntheses_session_id_number', ['sessionId', 'number'], {
  unique: true,
})
export class SessionSynthesisEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'integer' })
  number: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  roundIds: string[];

  @Column({ type: 'timestamptz' })
  writtenAt: Date;
}
