import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@proxenos/core';

import type { RepositoryLinkResponse } from './dto/repository-link.response.js';
import { RepositoryLinkEntity } from './repository-link.entity.js';

@Injectable()
export class RepositoryLinkMapper {
  /** A new link; its ID (UUIDv7) is generated here. */
  toEntity(
    organizationId: string,
    projectId: string,
    repositoryId: string,
    createdBy: string,
    now: Date,
  ): RepositoryLinkEntity {
    return Object.assign(new RepositoryLinkEntity(), {
      id: uuidv7(),
      organizationId,
      projectId,
      repositoryId,
      createdBy,
      createdAt: now,
    } satisfies RepositoryLinkEntity);
  }

  /** With the repository it links (from `RepositoriesService`). */
  toResponse(
    entity: RepositoryLinkEntity,
    repository: ApiTypes.RepositoryResponse,
  ): RepositoryLinkResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      repository,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
