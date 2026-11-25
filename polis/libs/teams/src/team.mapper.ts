import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateTeamRequest } from './dto/create-team.request.js';
import type { TeamMemberResponse } from './dto/team-member.response.js';
import type { TeamResponse } from './dto/team.response.js';
import type { TeamMemberEntity } from './team-member.entity.js';
import { TeamEntity } from './team.entity.js';

@Injectable()
export class TeamMapper {
  /** A new, active team; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateTeamRequest,
    organizationId: string,
    createdBy: string,
    now: Date,
  ): TeamEntity {
    return Object.assign(new TeamEntity(), {
      id: uuidv7(),
      organizationId,
      name: dto.name.trim(),
      slug: dto.slug,
      description: (dto.description ?? '').trim(),
      status: 'active',
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies TeamEntity);
  }

  toResponse(entity: TeamEntity, departmentIds: string[]): TeamResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      departmentIds,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  toMemberResponse(entity: TeamMemberEntity): TeamMemberResponse {
    return {
      teamId: entity.teamId,
      personId: entity.personId,
      addedBy: entity.addedBy,
      addedAt: entity.addedAt.toISOString(),
    };
  }
}
