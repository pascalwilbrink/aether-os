import { Inject, Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import { CouncilPlanEntity } from './council-plan.entity.js';
import { DeliberationRoundEntity } from './deliberation-round.entity.js';
import type { ProposedPlan } from './plans.js';
import type { Round } from './deliberation.js';
import type { SessionHistoryMessage } from './session-agent.js';
import {
  SessionMessageEntity,
  type SessionAuthor,
} from './session-message.entity.js';
import type { SessionSubject } from './session-subjects.js';
import { SessionEntity } from './session.entity.js';
import { SESSION_OPTIONS, type SessionOptions } from './session.options.js';

@Injectable()
export class SessionMapper {
  constructor(
    @Inject(SESSION_OPTIONS) private readonly options: SessionOptions,
  ) {}

  /** A new session; its ID (UUIDv7) here. */
  toEntity(
    fields: SessionSubject & {
      organizationId: string;
      projectId: string;
      startedBy: string;
      title: string | null;
      now: Date;
    },
  ): SessionEntity {
    return Object.assign(new SessionEntity(), {
      id: uuidv7(),
      organizationId: fields.organizationId,
      projectId: fields.projectId,
      agentId: fields.agentId,
      agentVersionId: fields.agentVersionId,
      councilId: fields.councilId,
      councilVersionId: fields.councilVersionId,
      members: fields.members,
      mode: fields.mode,
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
      councilId: entity.councilId,
      councilVersionId: entity.councilVersionId,
      members: entity.members,
      mode: entity.mode,
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
      authorKind: message.author.kind,
      authorAgentId: message.author.agentId,
      authorAgentVersionId: message.author.agentVersionId,
      content: message.content,
      toolCalls: message.toolCalls,
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      roundId: message.roundId ?? null,
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
      author: authorOf(entity),
      roundId: entity.roundId,
    };
  }

  toMessage(entity: SessionMessageEntity): ApiTypes.SessionMessage {
    return {
      id: entity.messageId,
      role: entity.role,
      author: authorOf(entity),
      content: entity.content,
      toolCalls: entity.toolCalls,
      toolCallId: entity.toolCallId,
      roundId: entity.roundId,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  toRound(entity: DeliberationRoundEntity): Round {
    return {
      id: entity.id,
      number: entity.number,
      question: entity.question,
      participants: entity.participants,
      status: entity.status,
      conclusion: entity.conclusion,
      openedAt: entity.openedAt,
      concludedAt: entity.concludedAt,
    };
  }

  toRoundEntity(sessionId: string, round: Round): DeliberationRoundEntity {
    return Object.assign(new DeliberationRoundEntity(), {
      ...round,
      sessionId,
    });
  }

  toPlanResponse(entity: CouncilPlanEntity): ApiTypes.CouncilPlan {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      number: entity.number,
      status: entity.status,
      title: entity.title,
      summary: entity.summary,
      milestones: entity.milestones,
      entries: entity.entries,
      outcomeEntryKey: entity.outcomeEntryKey,
      review: entity.review,
      taskId: entity.taskId,
      proposedAt: entity.proposedAt.toISOString(),
    };
  }

  /** A plan the facilitator proposed in a run, to keep. */
  toPlanEntity(sessionId: string, plan: ProposedPlan): CouncilPlanEntity {
    return Object.assign(new CouncilPlanEntity(), {
      id: plan.id,
      sessionId,
      number: plan.number,
      status: 'proposed' as const,
      ...plan.content,
      review: null,
      taskId: null,
      proposedAt: plan.proposedAt,
    });
  }

  toRoundResponse(entity: DeliberationRoundEntity): ApiTypes.DeliberationRound {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      number: entity.number,
      question: entity.question,
      participants: entity.participants,
      status: entity.status,
      conclusion: entity.conclusion,
      openedAt: entity.openedAt.toISOString(),
      concludedAt: entity.concludedAt?.toISOString() ?? null,
    };
  }
}

function authorOf(entity: SessionMessageEntity): SessionAuthor {
  return {
    kind: entity.authorKind,
    agentId: entity.authorAgentId,
    agentVersionId: entity.authorAgentVersionId,
  };
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
