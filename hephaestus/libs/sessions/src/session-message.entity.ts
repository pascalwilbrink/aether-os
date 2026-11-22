import { Check, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type SessionMessageRole = 'user' | 'assistant' | 'tool';

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
