import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@agora/core';

import { discussionOf, settingsOf } from './council-configuration.js';
import { CouncilVersionEntity } from './council-version.entity.js';
import { CouncilEntity } from './council.entity.js';

@Injectable()
export class CouncilMapper {
  /** A new, active council without versions; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: ApiTypes.CreateCouncilRequest,
    organizationId: string,
    createdBy: string,
    now: Date,
  ): CouncilEntity {
    return Object.assign(new CouncilEntity(), {
      id: uuidv7(),
      organizationId,
      key: dto.key,
      name: dto.name,
      description: dto.description,
      status: 'active',
      latestVersionId: null,
      version: 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies CouncilEntity);
  }

  toResponse(entity: CouncilEntity): ApiTypes.CouncilResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      key: entity.key,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      latestVersionId: entity.latestVersionId,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  /** A new draft with the given number, its settings' defaults filled in. */
  toVersionEntity(
    dto: ApiTypes.CreateCouncilVersionRequest,
    council: { organizationId: string; councilId: string },
    version: number,
    createdBy: string,
    now: Date,
  ): CouncilVersionEntity {
    return Object.assign(new CouncilVersionEntity(), {
      id: uuidv7(),
      councilId: council.councilId,
      organizationId: council.organizationId,
      version,
      status: 'draft',
      facilitatorAgentId: dto.facilitator.agentId,
      members: dto.members.map((member) => ({
        agentId: member.agentId,
        participation: member.participation,
        ...(member.when?.trim() ? { when: member.when.trim() } : {}),
        ...(member.role?.trim() ? { role: member.role.trim() } : {}),
      })),
      settings: settingsOf(dto.settings),
      discussion: discussionOf(dto.discussion),
      createdBy,
      createdAt: now,
      publishedAt: null,
    } satisfies CouncilVersionEntity);
  }

  toVersionResponse(
    entity: CouncilVersionEntity,
  ): ApiTypes.CouncilVersionResponse {
    return {
      id: entity.id,
      councilId: entity.councilId,
      organizationId: entity.organizationId,
      version: entity.version,
      status: entity.status,
      facilitator: { agentId: entity.facilitatorAgentId },
      members: entity.members,
      settings: entity.settings,
      discussion: entity.discussion,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      publishedAt: entity.publishedAt?.toISOString() ?? null,
    };
  }
}
