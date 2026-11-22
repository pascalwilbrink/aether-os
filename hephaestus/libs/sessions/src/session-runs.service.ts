import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';
import { AgentVersionsService } from '@hephaestus/agents';

import type { AguiEvent } from './agui.js';
import {
  SessionAgent,
  SessionRunError,
  failureOf,
  type SessionHistoryMessage,
} from './session-agent.js';
import { SessionTokens } from './session-tokens.js';
import { SESSION_OPTIONS, type SessionOptions } from './session.options.js';
import { SessionsService } from './sessions.service.js';

/** A session token lasts as long as Pistis allows. */
const SESSION_TOKEN_SECONDS = 900;

/** A run that has started: stream it once. */
export interface SessionRun {
  stream(emit: (event: AguiEvent) => void, signal: AbortSignal): Promise<void>;
}

/**
 * Runs a session's turn (`POST …/sessions/{sessionId}/runs`): everything
 * that can be refused is refused before the stream starts (the input, the
 * session, the run lock, the session token from Pistis), so the caller gets
 * problem details; once streaming, failures are `RUN_ERROR` events. The run
 * lock is always released and what the agent produced is kept.
 */
@Injectable()
export class SessionRunsService {
  private readonly logger = new Logger(SessionRunsService.name);

  constructor(
    private readonly sessions: SessionsService,
    private readonly agentVersions: AgentVersionsService,
    private readonly tokens: SessionTokens,
    private readonly agent: SessionAgent,
    @Inject(SESSION_OPTIONS) private readonly options: SessionOptions,
  ) {}

  async start(
    organizationId: string,
    projectId: string,
    sessionId: string,
    input: ApiTypes.RunAgentInput,
    userToken: string,
  ): Promise<SessionRun> {
    const { session, history } = await this.sessions.startRun(
      organizationId,
      projectId,
      sessionId,
      input,
    );
    let token: string;
    let agentVersion: Awaited<ReturnType<AgentVersionsService['findById']>>;
    try {
      agentVersion = await this.agentVersions.findById(
        organizationId,
        session.agentId,
        session.agentVersionId,
      );
      token = await this.tokens.issue({
        userToken,
        projectId,
        sessionId,
        agentId: session.agentId,
        agentVersionId: session.agentVersionId,
        expiresInSeconds: SESSION_TOKEN_SECONDS,
      });
    } catch (error) {
      await this.sessions.finishRun(sessionId, []);
      throw error;
    }

    return {
      stream: async (emit, clientSignal) => {
        const produced: SessionHistoryMessage[] = [];
        const timeout = new AbortController();
        const timer = setTimeout(
          () =>
            timeout.abort(
              new SessionRunError(
                `The run took longer than ${Math.round(this.options.runTimeoutMs / 1000)} seconds.`,
                'RUN_TIMEOUT',
              ),
            ),
          this.options.runTimeoutMs,
        );
        const signal = AbortSignal.any([clientSignal, timeout.signal]);
        const runId = input.runId;
        emit({ type: 'RUN_STARTED', threadId: sessionId, runId });
        try {
          await this.agent.run(
            {
              organizationId,
              projectId,
              sessionId,
              agentVersion,
              history,
              frontendTools: input.tools ?? [],
              context: input.context ?? [],
              state: input.state,
              token,
              signal,
            },
            emit,
            produced,
          );
          emit({ type: 'RUN_FINISHED', threadId: sessionId, runId });
        } catch (error) {
          const failure = failureOf(error, signal);
          if (failure.code === 'AGENT_FAILED') {
            this.logger.warn(
              `Session ${sessionId}'s run failed: ${failure.message}`,
            );
          }
          emit({
            type: 'RUN_ERROR',
            message: failure.message,
            code: failure.code,
          });
        } finally {
          clearTimeout(timer);
          await this.sessions.finishRun(sessionId, produced);
        }
      },
    };
  }
}
