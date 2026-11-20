import { Injectable } from '@nestjs/common';

import type { AgentVersion } from '@hephaestus/core';

import { AgentVersionEntity } from './agent-version.entity.js';

@Injectable()
export class AgentVersionMapper {
  /** A version as Agora published it, to store in the copy. */
  fromAgora(version: AgentVersion): AgentVersionEntity {
    return Object.assign(new AgentVersionEntity(), {
      id: version.id,
      agentId: version.agentId,
      organizationId: version.organizationId,
      version: version.version,
      status: version.status,
      instructions: version.instructions,
      model: version.model,
      capabilities: version.capabilities,
      tools: version.tools,
      skills: version.skills,
      runtime: version.runtime,
      createdBy: version.createdBy,
      createdAt: new Date(version.createdAt),
      publishedAt: version.publishedAt ? new Date(version.publishedAt) : null,
    } satisfies AgentVersionEntity);
  }

  toVersion(entity: AgentVersionEntity): AgentVersion {
    return {
      id: entity.id,
      agentId: entity.agentId,
      organizationId: entity.organizationId,
      version: entity.version,
      status: entity.status,
      instructions: entity.instructions,
      model: entity.model,
      capabilities: entity.capabilities,
      tools: entity.tools,
      skills: entity.skills,
      runtime: entity.runtime,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      publishedAt: entity.publishedAt?.toISOString() ?? null,
    };
  }
}
