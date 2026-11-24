import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type SessionMessageRole = 'user' | 'assistant' | 'tool';

/** Who wrote it: the person, an agent session's agent, a council's facilitator or a member. */
export interface SessionAuthor {
  kind: 'user' | 'agent' | 'facilitator' | 'member';
  agentId: string | null;
  agentVersionId: string | null;
}

export interface SessionToolCall {
  id: string;
  name: string;
  /** JSON text, as AG-UI carries it. */
  arguments: string;
}

/**
 * One message of a session, numbered within it (`ordinal`): the person's
 * (`user`), the agent's (`assistant`: text and tool calls) and tool results
 * (`tool`: the agent's own tools, and the frontend's answers to its tools).
 */
@Entity({ name: 'session_messages' })
@Check('ck_session_messages_role', `role IN ('user', 'assistant', 'tool')`)
@Check(
  'ck_session_messages_author_kind',
  `author_kind IN ('user', 'agent', 'facilitator', 'member')`,
)
@Index('uq_session_messages_session_id_ordinal', ['sessionId', 'ordinal'], {
  unique: true,
})
// AG-UI message IDs are the frontend's or the agent's: unique per session.
@Index(
  'uq_session_messages_session_id_message_id',
  ['sessionId', 'messageId'],
  { unique: true },
)
export class SessionMessageEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'integer' })
  ordinal: number;

  @Column({ type: 'text' })
  messageId: string;

  @Column({ type: 'text' })
  role: SessionMessageRole;

  @Column({ type: 'text' })
  authorKind: SessionAuthor['kind'];

  @Column({ type: 'uuid', nullable: true })
  authorAgentId: string | null;

  @Column({ type: 'uuid', nullable: true })
  authorAgentVersionId: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  toolCalls: SessionToolCall[];

  @Column({ type: 'text', nullable: true })
  toolCallId: string | null;

  /** A tool message's tool, for the model's history. */
  @Column({ type: 'text', nullable: true })
  toolName: string | null;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
