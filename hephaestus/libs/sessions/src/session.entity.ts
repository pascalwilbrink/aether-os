import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryColumn,
  VersionColumn,
} from 'typeorm';

import type { SessionMode } from './modes.js';

export type SessionStatus = 'active' | 'ended';
export type SessionEndedReason = 'closed' | 'idle';

/** A council session's member, pinned when it started (../../../../docs/councils.md). */
export interface SessionMemberState {
  agentId: string;
  agentVersionId: string;
  name: string;
  participation: 'required' | 'conditional' | 'optional';
  role: string | null;
  when: string | null;
  /** Taking part: required members always; others once invited or addressed. */
  invited: boolean;
}

/**
 * A conversation between a person and an agent in a project
 * (../../../../docs/interaction.md): the agent version is pinned when it
 * starts, and only the person who started it sees and uses it.
 */
@Entity({ name: 'sessions' })
@Check('ck_sessions_status', `status IN ('active', 'ended')`)
@Check(
  'ck_sessions_mode',
  `mode IS NULL OR mode IN ('direct', 'facilitated', 'discussion', 'planning', 'delegation')`,
)
@Check(
  'ck_sessions_ended_reason',
  `ended_reason IS NULL OR ended_reason IN ('closed', 'idle')`,
)
// Keyset pagination: a person's sessions in a project, newest first.
@Index('ix_sessions_project_id_started_by_created_at_id', [
  'projectId',
  'startedBy',
  'createdAt',
  'id',
])
// The reaper: active sessions by their last activity.
@Index('ix_sessions_status_last_activity_at', ['status', 'lastActivityAt'])
export class SessionEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  @Column({ type: 'uuid' })
  agentId: string;

  @Column({ type: 'uuid' })
  agentVersionId: string;

  /** A council session's council and version (the agent is its facilitator). */
  @Column({ type: 'uuid', nullable: true })
  councilId: string | null;

  @Column({ type: 'uuid', nullable: true })
  councilVersionId: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  members: SessionMemberState[];

  /** A council session's current way of working; null in an agent session. */
  @Column({ type: 'text', nullable: true })
  mode: SessionMode | null;

  /** The person's `sub`. */
  @Column({ type: 'text' })
  startedBy: string;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'text' })
  status: SessionStatus;

  @Column({ type: 'text', nullable: true })
  endedReason: SessionEndedReason | null;

  /** When the run under way started: one run at a time (a stale one doesn't count). */
  @Column({ type: 'timestamptz', nullable: true })
  runningSince: Date | null;

  @Column({ type: 'timestamptz' })
  lastActivityAt: Date;

  @Column({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  /** One more per change; its events' `aggregateVersion`. */
  @VersionColumn()
  version: number;
}
