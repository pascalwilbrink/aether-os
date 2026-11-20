import { DomainError } from '@agora/core';

import type { AgentVersionStatus } from './agent-transitions.js';

export class AgentArchivedError extends DomainError {
  constructor(agentId: string) {
    super(`Agent ${agentId} is archived.`, 'AGENT_ARCHIVED');
  }
}

export class AgentVersionConflictError extends DomainError {
  constructor(agentId: string, version: number) {
    super(
      `Version ${version} already exists for agent ${agentId}.`,
      'AGENT_VERSION_CONFLICT',
    );
  }
}

export class InvalidAgentVersionTransitionError extends DomainError {
  constructor(
    versionId: string,
    from: AgentVersionStatus,
    to: AgentVersionStatus,
  ) {
    super(
      `Agent version ${versionId} can't move from ${from} to ${to}.`,
      'AGENT_VERSION_INVALID_TRANSITION',
    );
  }
}

/**
 * Hephaestus refused a version's model, tools or skills
 * (`MODEL_NOT_AVAILABLE`, `TOOL_SERVER_INVALID`, `SKILL_INVALID`): the
 * same 409, with its code and reason.
 */
export class AgentVersionChoiceError extends DomainError {
  constructor(reason: string, code: string) {
    super(reason, code);
  }
}
