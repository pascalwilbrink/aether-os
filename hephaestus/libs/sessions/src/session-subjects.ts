import { Injectable } from '@nestjs/common';

import { ValidationProblemException } from '@hephaestus/core';
import { AgentsService } from '@hephaestus/agents';
import { CouncilsService } from '@hephaestus/councils';

import { initialMode, modeProblem, type SessionMode } from './modes.js';
import type { SessionMemberState } from './session.entity.js';

/** What a session talks to, pinned when it starts. */
export interface SessionSubject {
  /** The agent; in a council session the facilitator. */
  agentId: string;
  agentVersionId: string;
  councilId: string | null;
  councilVersionId: string | null;
  members: SessionMemberState[];
  /** A council session's first mode. */
  mode: SessionMode | null;
}

/**
 * Pins a new session's subject: an agent's published version, or a
 * council's (../../../../docs/councils.md) with its facilitator's and each
 * member's published agent version, as tasks pin theirs. A member without
 * one refuses the session (`AGENT_NOT_PUBLISHED`, `AGENT_ARCHIVED`).
 */
@Injectable()
export class SessionSubjects {
  constructor(
    private readonly agents: AgentsService,
    private readonly councils: CouncilsService,
  ) {}

  /** Why a council session can't be in `mode` (its pinned version's settings), or null. */
  async modeProblem(
    organizationId: string,
    councilVersionId: string,
    mode: SessionMode,
  ): Promise<string | null> {
    const version = await this.councils.version(
      organizationId,
      councilVersionId,
    );
    return modeProblem(mode, version.settings);
  }

  async pin(
    organizationId: string,
    request: { agentId?: string; councilId?: string },
  ): Promise<SessionSubject> {
    if (Boolean(request.agentId) === Boolean(request.councilId)) {
      throw new ValidationProblemException([
        {
          pointer: '',
          parameter: null,
          code: 'INVALID',
          detail: 'Give exactly one of agentId and councilId.',
        },
      ]);
    }
    if (request.agentId) {
      return {
        agentId: request.agentId,
        agentVersionId: await this.agents.publishedVersion(
          organizationId,
          request.agentId,
        ),
        councilId: null,
        councilVersionId: null,
        members: [],
        mode: null,
      };
    }
    const council = await this.councils.publishedVersion(
      organizationId,
      request.councilId as string,
    );
    const facilitatorId = council.facilitator.agentId;
    const facilitatorVersionId = await this.agents.publishedVersion(
      organizationId,
      facilitatorId,
    );
    const names = await this.agents.names(
      organizationId,
      council.members.map((member) => member.agentId),
    );
    const members: SessionMemberState[] = [];
    for (const member of council.members) {
      members.push({
        agentId: member.agentId,
        agentVersionId: await this.agents.publishedVersion(
          organizationId,
          member.agentId,
        ),
        name: names.get(member.agentId) ?? member.agentId,
        participation: member.participation,
        role: member.role ?? null,
        when: member.when ?? null,
        invited: member.participation === 'required',
      });
    }
    return {
      agentId: facilitatorId,
      agentVersionId: facilitatorVersionId,
      councilId: council.councilId,
      councilVersionId: council.id,
      members,
      mode: initialMode(council.settings),
    };
  }
}
