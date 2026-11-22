import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import type { SessionHistoryMessage } from './session-agent.js';
import { SessionMessageEntity } from './session-message.entity.js';
import { SessionEntity } from './session.entity.js';
import { SESSION_OPTIONS, type SessionOptions } from './session.options.js';

@Injectable()
export class SessionMapper {
  constructor(
    @Inject(SESSION_OPTIONS) private readonly options: SessionOptions,
  ) {}

  /** A new session; its ID (UUIDv7) here. */
  toEntity(fields: {
    organizationId: string;
    projectId: string;
    agentId: string;
    agentVersionId: string;
    startedBy: string;
    title: string | null;
    now: Date;
  }): SessionEntity {
    return Object.assign(new SessionEntity(), {
      id: uuidv7(),
      organizationId: fields.organizationId,
      projectId: fields.projectId,
      agentId: fields.agentId,
      agentVersionId: fields.agentVersionId,
      startedBy: fields.startedBy,
      title: fields.title,
      status: 'active',
      endedReason: null,
      runningSince: null,
      lastActivityAt: fields.now,
      createdAt: fields.now,
      endedAt: null,
    });
  }

  /** A run under way: one younger than the run timeout (an older one was lost). */
  running(entity: Pick<SessionEntity, 'runningSince'>, now = new Date()) {
    return isRunning(entity, this.options.runTimeoutMs, now);
  }

  toResponse(
    entity: SessionEntity,
    now = new Date(),
  ): ApiTypes.SessionResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      agentId: entity.agentId,
      agentVersionId: entity.agentVersionId,
      startedBy: entity.startedBy,
      title: entity.title,
      status: entity.status,
      endedReason: entity.endedReason,
      running: this.running(entity, now),
      lastActivityAt: entity.lastActivityAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      endedAt: entity.endedAt?.toISOString() ?? null,
    };
  }

  toMessageEntity(
    sessionId: string,
    ordinal: number,
    message: SessionHistoryMessage,
    now: Date,
  ): SessionMessageEntity {
    return Object.assign(new SessionMessageEntity(), {
      id: uuidv7(),
      sessionId,
      ordinal,
      messageId: message.messageId,
      role: message.role,
      content: message.content,
      toolCalls: message.toolCalls,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      createdAt: now,
    });
  }

  toHistory(entity: SessionMessageEntity): SessionHistoryMessage {
    return {
      messageId: entity.messageId,
      role: entity.role,
      content: entity.content,
      toolCalls: entity.toolCalls,
      toolCallId: entity.toolCallId,
      toolName: entity.toolName,
    };
  }

  toMessage(entity: SessionMessageEntity): ApiTypes.SessionMessage {
    return {
      id: entity.messageId,
      role: entity.role,
      content: entity.content,
      toolCalls: entity.toolCalls,
      toolCallId: entity.toolCallId,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}

export function isRunning(
  entity: Pick<SessionEntity, 'runningSince'>,
  runTimeoutMs: number,
  now: Date,
): boolean {
  return (
    entity.runningSince !== null &&
    now.getTime() - entity.runningSince.getTime() < runTimeoutMs
  );
}
