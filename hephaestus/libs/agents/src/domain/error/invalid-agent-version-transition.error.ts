import { DomainError, type AgentVersionId } from '@hephaestus/core';

import type { AgentVersionStatus } from '../agent-version.js';

export class InvalidAgentVersionTransitionError extends DomainError {
  constructor(
    public readonly versionId: AgentVersionId,
    public readonly from: AgentVersionStatus,
    public readonly to: AgentVersionStatus,
  ) {
    super(
      `Agent version ${versionId} cannot move from ${from} to ${to}`,
      'AGENT_VERSION_INVALID_TRANSITION',
    );
  }
}
