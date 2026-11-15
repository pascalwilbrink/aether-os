import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { AgentVersionEntity } from './agent-version.entity.js';
import type { AgentVersionResponse } from './dto/agent-version.response.js';
import type { CreateAgentVersionRequest } from './dto/create-agent-version.request.js';

@Injectable()
export class AgentVersionMapper {
  /** A new draft with the given number; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateAgentVersionRequest,
    agent: { organizationId: string; agentId: string },
    version: number,
    createdBy: string,
    now: Date,
  ): AgentVersionEntity {
    return Object.assign(new AgentVersionEntity(), {
      id: uuidv7(),
      agentId: agent.agentId,
      organizationId: agent.organizationId,
      version,
      status: 'draft',
      instructions: dto.instructions,
      model: dto.model,
      capabilities: dto.capabilities,
      tools: dto.tools,
      skills: dto.skills,
      runtime: dto.runtime,
      createdBy,
      createdAt: now,
      publishedAt: null,
    } satisfies AgentVersionEntity);
  }

  toResponse(entity: AgentVersionEntity): AgentVersionResponse {
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
