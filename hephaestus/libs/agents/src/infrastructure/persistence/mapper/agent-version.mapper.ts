import { Injectable } from '@nestjs/common';

import type {
  AgentId,
  AgentVersionId,
  OrganizationId,
} from '@hephaestus/core';

import { AgentVersion } from '../../../domain/agent-version.js';
import { AgentVersionEntity } from '../entity/agent-version.entity.js';

@Injectable()
export class AgentVersionMapper {
  toEntity(version: AgentVersion): AgentVersionEntity {
    return Object.assign(new AgentVersionEntity(), {
      id: version.id,
      agentId: version.agentId,
      organizationId: version.organizationId,
      version: version.version,
      instructions: version.instructions,
      model: version.model,
      capabilities: [...version.capabilities],
      tools: [...version.tools],
      skills: [...version.skills],
      runtime: version.runtime,
      status: version.status,
      createdBy: version.createdBy,
      createdAt: version.createdAt,
      publishedAt: version.publishedAt,
    } satisfies AgentVersionEntity);
  }

  toDomain(entity: AgentVersionEntity): AgentVersion {
    return AgentVersion.reconstitute({
      id: entity.id as AgentVersionId,
      agentId: entity.agentId as AgentId,
      organizationId: entity.organizationId as OrganizationId,
      version: entity.version,
      instructions: entity.instructions,
      model: entity.model,
      capabilities: entity.capabilities,
      tools: entity.tools,
      skills: entity.skills,
      runtime: entity.runtime,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      publishedAt: entity.publishedAt,
    });
  }
}
