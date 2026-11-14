import { DomainError, type AgentId } from '@hephaestus/core';

export class AgentArchivedError extends DomainError {
  constructor(public readonly agentId: AgentId) {
    super(`Agent ${agentId} is archived`, 'AGENT_ARCHIVED');
  }
}
