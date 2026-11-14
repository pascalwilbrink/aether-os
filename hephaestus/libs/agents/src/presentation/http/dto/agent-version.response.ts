import type {
  AgentModelConfiguration,
  AgentRuntimeConfiguration,
  AgentSkillConfiguration,
  AgentToolConfiguration,
  AgentVersion,
  AgentVersionStatus,
} from '../../../domain/agent-version.js';

import type { ApiSchema } from '@hephaestus/core';

export class AgentVersionResponse implements ApiSchema<'AgentVersionResponse'> {
  id: string;
  agentId: string;
  organizationId: string;
  version: number;
  status: AgentVersionStatus;
  instructions: string;
  model: AgentModelConfiguration;
  capabilities: string[];
  tools: AgentToolConfiguration[];
  skills: AgentSkillConfiguration[];
  runtime: AgentRuntimeConfiguration;
  createdBy: string;
  createdAt: string;
  publishedAt: string | null;

  static fromDomain(version: AgentVersion): AgentVersionResponse {
    return Object.assign(new AgentVersionResponse(), {
      id: version.id,
      agentId: version.agentId,
      organizationId: version.organizationId,
      version: version.version,
      status: version.status,
      instructions: version.instructions,
      model: version.model,
      capabilities: [...version.capabilities],
      tools: [...version.tools],
      skills: [...version.skills],
      runtime: version.runtime,
      createdBy: version.createdBy,
      createdAt: version.createdAt.toISOString(),
      publishedAt: version.publishedAt?.toISOString() ?? null,
    } satisfies AgentVersionResponse);
  }
}
