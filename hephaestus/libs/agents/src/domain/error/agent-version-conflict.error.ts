import { DomainError, type AgentId } from '@hephaestus/core';

export class AgentVersionConflictError extends DomainError {
  constructor(
    public readonly agentId: AgentId,
    public readonly version: number,
  ) {
    super(
      `Version ${version} already exists for agent ${agentId}`,
      'AGENT_VERSION_CONFLICT',
    );
  }
}
