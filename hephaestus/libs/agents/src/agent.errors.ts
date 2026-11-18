import { DomainError } from '@hephaestus/core';

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

export class AgentNotPublishedError extends DomainError {
  constructor(agentId: string) {
    super(`Agent ${agentId} has no published version.`, 'AGENT_NOT_PUBLISHED');
  }
}
