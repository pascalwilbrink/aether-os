import { Injectable } from '@nestjs/common';

import type { AgoraEvents } from '@hephaestus/core';

import { AgentEntity } from './agent.entity.js';

@Injectable()
export class AgentMapper {
  /** A new agent, as `agent.created` describes it: active, no version yet. */
  fromCreated(
    payload: AgoraEvents.AgentCreated,
    organizationId: string,
    version: number,
  ): AgentEntity {
    const createdAt = new Date(payload.createdAt);
    return Object.assign(new AgentEntity(), {
      id: payload.agentId,
      organizationId,
      name: payload.name,
      description: payload.description,
      status: 'active',
      latestVersionId: null,
      version,
      createdBy: payload.createdBy,
      createdAt,
      updatedAt: createdAt,
    } satisfies AgentEntity);
  }
}
