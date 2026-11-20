import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { AgentEntity } from './agent.entity.js';
import type { AgentResponse } from './dto/agent.response.js';
import type { CreateAgentRequest } from './dto/create-agent.request.js';

@Injectable()
export class AgentMapper {
  /** A new, active agent without versions; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateAgentRequest,
    organizationId: string,
    createdBy: string,
    now: Date,
  ): AgentEntity {
    return Object.assign(new AgentEntity(), {
      id: uuidv7(),
      organizationId,
      name: dto.name,
      description: dto.description,
      status: 'active',
      latestVersionId: null,
      version: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies AgentEntity);
  }

  toResponse(entity: AgentEntity): AgentResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      latestVersionId: entity.latestVersionId,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
