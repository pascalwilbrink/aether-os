import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { GitHubRepository } from '@proxenos/github';

import type { RepositoryResponse } from './dto/repository.response.js';
import { RepositoryEntity } from './repository.entity.js';

@Injectable()
export class RepositoryMapper {
  /** A repository an installation now covers; its ID (UUIDv7) is generated here. */
  toEntity(
    installation: { id: string; organizationId: string },
    repository: GitHubRepository,
    now: Date,
  ): RepositoryEntity {
    return Object.assign(new RepositoryEntity(), {
      id: uuidv7(),
      organizationId: installation.organizationId,
      installationId: installation.id,
      externalId: repository.id,
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      private: repository.private,
      status: 'available',
      createdAt: now,
      updatedAt: now,
    } satisfies RepositoryEntity);
  }

  toResponse(entity: RepositoryEntity): RepositoryResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      installationId: entity.installationId,
      externalId: entity.externalId,
      fullName: entity.fullName,
      defaultBranch: entity.defaultBranch,
      private: entity.private,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
