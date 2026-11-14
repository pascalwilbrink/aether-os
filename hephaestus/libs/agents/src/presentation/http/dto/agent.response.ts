import type { Agent, AgentStatus } from '../../../domain/agent.js';

import type { ApiSchema } from '@hephaestus/core';

export class AgentResponse implements ApiSchema<'AgentResponse'> {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  status: AgentStatus;
  latestVersionId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  static fromDomain(agent: Agent): AgentResponse {
    return Object.assign(new AgentResponse(), {
      id: agent.id,
      organizationId: agent.organizationId,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      latestVersionId: agent.latestVersionId,
      createdBy: agent.createdBy,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    } satisfies AgentResponse);
  }
}
