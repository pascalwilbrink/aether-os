import { DomainError } from '@hephaestus/core';

export class AgentArchivedError extends DomainError {
  constructor(agentId: string) {
    super(`Agent ${agentId} is archived.`, 'AGENT_ARCHIVED');
  }
}

export class AgentNotPublishedError extends DomainError {
  constructor(agentId: string) {
    super(`Agent ${agentId} has no published version.`, 'AGENT_NOT_PUBLISHED');
  }
}

/**
 * An Agora event about an agent Hephaestus hasn't heard of yet (its
 * `agent.created` hasn't arrived): thrown so the consumer retries it later.
 */
export class AgentNotCopiedYetError extends Error {
  constructor(agentId: string) {
    super(`Agent ${agentId} isn't in Hephaestus's copy yet`);
  }
}
