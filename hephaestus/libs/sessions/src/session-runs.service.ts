import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AgentVersion, ApiTypes } from '@hephaestus/core';
import { AgentVersionsService } from '@hephaestus/agents';
import { CouncilsService } from '@hephaestus/councils';

import type { AguiEvent } from './agui.js';
import {
  SessionAgent,
  SessionRunError,
  failureOf,
  type CouncilMemberForRun,
  type SessionHistoryMessage,
  type SessionTurn,
} from './session-agent.js';
import { Deliberation } from './deliberation.js';
import { allowedModes } from './modes.js';
import { SessionMemberInvalidError } from './session.errors.js';
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
    private readonly councils: CouncilsService,
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
    const addressed = await this.addressedMember(
      organizationId,
      projectId,
      sessionId,
      input.forwardedProps?.memberAgentId,
    );
    const { session, history, rounds } = await this.sessions.startRun(
      organizationId,
      projectId,
      sessionId,
      input,
    );
    // One session token per agent that speaks (Pylon meters each to its
    // agent), the first one now, so Pistis refusing is a 403.
    const tokens = new Map<string, Promise<string>>();
    const tokenFor = (agentId: string, agentVersionId: string) => {
      let token = tokens.get(agentId);
      if (!token) {
        token = this.tokens.issue({
          userToken,
          projectId,
          sessionId,
          agentId,
          agentVersionId,
          expiresInSeconds: SESSION_TOKEN_SECONDS,
        });
        tokens.set(agentId, token);
      }
      return token;
    };
    let agentVersion: AgentVersion;
    let council: SessionTurn['council'] = null;
    try {
      agentVersion = await this.agentVersions.findById(
        organizationId,
        session.agentId,
        session.agentVersionId,
      );
      if (session.councilId && session.councilVersionId) {
        const councilVersion = await this.councils.version(
          organizationId,
          session.councilVersionId,
        );
        const members: CouncilMemberForRun[] = [];
        for (const member of session.members) {
          members.push({
            ...member,
            version: await this.agentVersions.findById(
              organizationId,
              member.agentId,
              member.agentVersionId,
            ),
          });
        }
        council = {
          members,
          addressed,
          deliberation: new Deliberation(
            {
              allowed: councilVersion.settings.allowDiscussion,
              maxRounds: councilVersion.discussion.maxRounds,
              allowAgentResponses:
                councilVersion.discussion.allowAgentResponses,
              requireConclusion:
                councilVersion.discussion.requireFacilitatorConclusion,
            },
            rounds,
          ),
          modes: {
            current: session.mode ?? 'facilitated',
            allowed: allowedModes(councilVersion.settings),
            changed: false,
          },
        };
      }
      const first = addressed
        ? (council?.members.find((member) => member.agentId === addressed)
            ?.version ?? agentVersion)
        : agentVersion;
      await tokenFor(first.agentId, first.id);
    } catch (error) {
      await this.sessions.finishRun(sessionId, []);
      throw error;
    }
    const invited = new Set<string>();

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
              council,
              history,
              frontendTools: input.tools ?? [],
              context: input.context ?? [],
              state: input.state,
              tokenFor,
              invited,
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
          await this.sessions.finishRun(
            sessionId,
            produced,
            invited,
            council?.deliberation.changed() ?? [],
            council?.modes.changed ? council.modes.current : null,
          );
        }
      },
    };
  }

  /**
   * The member a run addresses directly (`forwardedProps.memberAgentId`):
   * only in a council session that allows it, and only a member of it.
   */
  private async addressedMember(
    organizationId: string,
    projectId: string,
    sessionId: string,
    memberAgentId: string | undefined,
  ): Promise<string | null> {
    if (!memberAgentId) {
      return null;
    }
    const session = await this.sessions.findById(
      organizationId,
      projectId,
      sessionId,
    );
    if (!session.councilVersionId) {
      throw new SessionMemberInvalidError(
        'Only a council session has members to address.',
      );
    }
    const version = await this.councils.version(
      organizationId,
      session.councilVersionId,
    );
    if (!version.settings.allowDirectInteraction) {
      throw new SessionMemberInvalidError(
        "This council doesn't allow addressing its members directly.",
      );
    }
    if (!session.members.some((member) => member.agentId === memberAgentId)) {
      throw new SessionMemberInvalidError(
        `${memberAgentId} isn't a member of this council.`,
      );
    }
    return memberAgentId;
  }
}
