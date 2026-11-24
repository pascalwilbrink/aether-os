import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, type Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  HephaestusEvents,
  mapPage,
  Transactional,
  ValidationProblemException,
  type ApiTypes,
  type Page,
  type PageRequest,
} from '@hephaestus/core';
import { ProjectsService } from '@hephaestus/tenancy';

import type { SessionHistoryMessage } from './session-agent.js';
import { SessionMessagesService } from './session-messages.service.js';
import { SessionSubjects } from './session-subjects.js';
import { SessionBusyError, SessionEndedError } from './session.errors.js';
import { SessionEntity, type SessionEndedReason } from './session.entity.js';
import { SessionMapper } from './session.mapper.js';

/** A run that may start: the session, and the agent's history with the new messages. */
export interface StartedRun {
  session: SessionEntity;
  history: SessionHistoryMessage[];
}

/**
 * Sessions (../../../../docs/interaction.md): a person's conversations with
 * an agent in a project. Only the person who started one sees it (anyone
 * else gets a 404, as for a resource that doesn't exist); one run at a time
 * (`runningSince`, under the session's row lock).
 */
@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    private readonly messages: SessionMessagesService,
    private readonly mapper: SessionMapper,
    private readonly subjects: SessionSubjects,
    private readonly projects: ProjectsService,
    private readonly access: AccessControl,
    private readonly events: HephaestusEvents,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    body: ApiTypes.CreateSessionRequest,
  ): Promise<ApiTypes.SessionResponse> {
    const person = this.person();
    await this.projects.assertAcceptsWrites(organizationId, projectId);
    const subject = await this.subjects.pin(organizationId, body);
    const entity = await this.sessions.save(
      this.mapper.toEntity({
        organizationId,
        projectId,
        ...subject,
        startedBy: person,
        title: body.title ?? null,
        now: new Date(),
      }),
    );
    await this.events.emit({
      eventType: 'session.started',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId,
      payload: {
        sessionId: entity.id,
        agentId: entity.agentId,
        agentVersionId: entity.agentVersionId,
        councilId: entity.councilId,
        councilVersionId: entity.councilVersionId,
        startedBy: entity.startedBy,
      },
    });
    return this.mapper.toResponse(entity);
  }

  async list(
    organizationId: string,
    projectId: string,
    query: PageRequest & { status?: ApiTypes.SessionStatus },
  ): Promise<Page<ApiTypes.SessionResponse>> {
    const { status, ...page } = query;
    const entities = await findPage(
      this.sessions,
      {
        where: {
          organizationId,
          projectId,
          startedBy: this.access.principal().sub,
          ...(status ? { status } : {}),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    projectId: string,
    sessionId: string,
  ): Promise<ApiTypes.SessionResponse> {
    return this.mapper.toResponse(
      await this.load(organizationId, projectId, sessionId),
    );
  }

  async messagesOf(
    organizationId: string,
    projectId: string,
    sessionId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.SessionMessage>> {
    await this.load(organizationId, projectId, sessionId);
    return this.messages.page(sessionId, page);
  }

  /** Ends it (`closed`); an ended session is returned as it is. */
  @Transactional()
  async end(
    organizationId: string,
    projectId: string,
    sessionId: string,
  ): Promise<ApiTypes.SessionResponse> {
    const session = await this.load(organizationId, projectId, sessionId, true);
    if (session.status === 'active') {
      await this.markEnded(session, 'closed');
    }
    return this.mapper.toResponse(session);
  }

  /**
   * Starts a run: checks the input against the session (`threadId`, its
   * person, not ended, not running), adds the new `user` messages and the
   * frontend's `tool` answers, and takes the run lock.
   */
  @Transactional()
  async startRun(
    organizationId: string,
    projectId: string,
    sessionId: string,
    input: ApiTypes.RunAgentInput,
  ): Promise<StartedRun> {
    if (input.threadId !== sessionId) {
      throw new ValidationProblemException([
        {
          pointer: '/threadId',
          parameter: null,
          code: 'INVALID',
          detail: "threadId must be the session's ID.",
        },
      ]);
    }
    const session = await this.load(organizationId, projectId, sessionId, true);
    if (session.status === 'ended') {
      throw new SessionEndedError(sessionId);
    }
    const now = new Date();
    if (this.mapper.running(session, now)) {
      throw new SessionBusyError(sessionId);
    }
    const history = await this.messages.history(sessionId);
    const added = newMessages(history, input.messages);
    if (added.length === 0) {
      throw new ValidationProblemException([
        {
          pointer: '/messages',
          parameter: null,
          code: 'INVALID',
          detail:
            'A run needs a new user message, or a tool message answering one of the agent’s calls.',
        },
      ]);
    }
    await this.messages.append(sessionId, added, now);
    session.runningSince = now;
    session.lastActivityAt = now;
    await this.sessions.save(session);
    return { session, history: [...history, ...added] };
  }

  /**
   * Keeps what the run produced, marks the members it brought into the
   * conversation, and releases the run lock.
   */
  @Transactional()
  async finishRun(
    sessionId: string,
    produced: readonly SessionHistoryMessage[],
    invited: ReadonlySet<string> = new Set(),
  ): Promise<void> {
    const session = await this.sessions.findOne({
      where: { id: sessionId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!session) {
      return;
    }
    const now = new Date();
    await this.messages.append(
      sessionId,
      produced.filter(
        (message) =>
          message.role !== 'assistant' ||
          message.content !== '' ||
          message.toolCalls.length > 0,
      ),
      now,
    );
    if (invited.size > 0) {
      session.members = session.members.map((member) =>
        invited.has(member.agentId) ? { ...member, invited: true } : member,
      );
    }
    session.runningSince = null;
    session.lastActivityAt = now;
    await this.sessions.save(session);
  }

  /**
   * Ends sessions with no run since `before` (`idle`), a batch at a time
   * (`FOR UPDATE SKIP LOCKED`, so instances share the work); a run under
   * way keeps its session, unless it's older than `runStartedBefore` (lost).
   */
  @Transactional()
  async endIdle(
    before: Date,
    runStartedBefore: Date,
    limit = 100,
  ): Promise<number> {
    const idle = await this.sessions
      .createQueryBuilder('session')
      .where('session.status = :status', { status: 'active' })
      .andWhere('session.last_activity_at < :before', { before })
      .andWhere(
        new Brackets((running) =>
          running
            .where('session.running_since IS NULL')
            .orWhere('session.running_since < :runStartedBefore', {
              runStartedBefore,
            }),
        ),
      )
      .orderBy('session.last_activity_at', 'ASC')
      .limit(limit)
      .setLock('pessimistic_write')
      .setOnLocked('skip_locked')
      .getMany();
    for (const session of idle) {
      session.runningSince = null;
      await this.markEnded(session, 'idle');
    }
    return idle.length;
  }

  private async markEnded(
    session: SessionEntity,
    reason: SessionEndedReason,
  ): Promise<void> {
    const now = new Date();
    session.status = 'ended';
    session.endedReason = reason;
    session.endedAt = now;
    await this.sessions.save(session);
    await this.events.emit({
      eventType: 'session.ended',
      aggregateId: session.id,
      aggregateVersion: session.version,
      organizationId: session.organizationId,
      projectId: session.projectId,
      payload: {
        sessionId: session.id,
        agentId: session.agentId,
        agentVersionId: session.agentVersionId,
        startedBy: session.startedBy,
        reason,
      },
    });
  }

  /** The caller's session in the project; 404 for anyone else's. */
  private async load(
    organizationId: string,
    projectId: string,
    sessionId: string,
    lock = false,
  ): Promise<SessionEntity> {
    const session = await this.sessions.findOne({
      where: {
        id: sessionId,
        organizationId,
        projectId,
        startedBy: this.access.principal().sub,
      },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }
    return session;
  }

  /** Sessions are for people, with their own token (not a session's). */
  private person(): string {
    const principal = this.access.principal();
    if (principal.subType !== 'user' || principal.sessionId) {
      throw new ForbiddenException(
        'Sessions are started by people, with their own token.',
      );
    }
    return principal.sub;
  }
}

/**
 * The input's messages the session doesn't have yet (by ID): the person's,
 * and tool messages answering one of the agent's calls (with its tool's
 * name). Anything else (the agent's own messages, system messages) is the
 * frontend's copy and is ignored.
 */
export function newMessages(
  history: readonly SessionHistoryMessage[],
  input: readonly ApiTypes.AguiMessage[],
): SessionHistoryMessage[] {
  const known = new Set(history.map((message) => message.messageId));
  const calls = new Map<string, string>();
  for (const message of history) {
    for (const call of message.toolCalls) {
      calls.set(call.id, call.name);
    }
  }
  const answered = new Set(
    history
      .filter((message) => message.role === 'tool')
      .map((message) => message.toolCallId),
  );
  const added: SessionHistoryMessage[] = [];
  for (const message of input) {
    if (known.has(message.id)) {
      continue;
    }
    if (message.role === 'user') {
      known.add(message.id);
      added.push({
        messageId: message.id,
        role: 'user',
        content: message.content ?? '',
        toolCalls: [],
        toolCallId: null,
        toolName: null,
        author: { kind: 'user', agentId: null, agentVersionId: null },
      });
    } else if (
      message.role === 'tool' &&
      message.toolCallId &&
      calls.has(message.toolCallId) &&
      !answered.has(message.toolCallId)
    ) {
      known.add(message.id);
      answered.add(message.toolCallId);
      added.push({
        messageId: message.id,
        role: 'tool',
        content: message.content ?? '',
        toolCalls: [],
        toolCallId: message.toolCallId,
        toolName: calls.get(message.toolCallId) ?? null,
        // The frontend's answer, for the person.
        author: { kind: 'user', agentId: null, agentVersionId: null },
      });
    }
  }
  return added;
}
