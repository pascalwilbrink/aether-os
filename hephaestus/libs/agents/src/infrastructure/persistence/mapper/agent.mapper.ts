import { Injectable } from '@nestjs/common';

import type { AgentId, AgentVersionId, OrganizationId } from '@hephaestus/core';

import { Agent } from '../../../domain/agent.js';
import { AgentEntity } from '../entity/agent.entity.js';

@Injectable()
export class AgentMapper {
  toEntity(agent: Agent): AgentEntity {
    return Object.assign(new AgentEntity(), {
      id: agent.id,
      organizationId: agent.organizationId,
      name: agent.name,
      description: agent.description,
      status: agent.status,
      latestVersionId: agent.latestVersionId,
      createdBy: agent.createdBy,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    } satisfies AgentEntity);
  }

  toDomain(entity: AgentEntity): Agent {
    return Agent.reconstitute({
      id: entity.id as AgentId,
      organizationId: entity.organizationId as OrganizationId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      latestVersionId: entity.latestVersionId as AgentVersionId | null,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
