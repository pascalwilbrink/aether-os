import { DomainError } from '@ergon/core';

export class UnknownAssigneeError extends DomainError {
  constructor(kind: string, id: string) {
    super(
      `No ${kind} ${id} in this organization (Ergon knows them from ${kind === 'agent' ? "Agora's" : "Polis's"} events).`,
      'UNKNOWN_ASSIGNEE',
    );
  }
}

export class AgentArchivedError extends DomainError {
  constructor(agentId: string) {
    super(`Agent ${agentId} is archived.`, 'AGENT_ARCHIVED');
  }
}
