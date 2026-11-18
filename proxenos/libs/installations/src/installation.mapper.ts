import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { GitHubInstallation } from '@proxenos/github';

import type { InstallationResponse } from './dto/installation.response.js';
import { InstallationEntity } from './installation.entity.js';

@Injectable()
export class InstallationMapper {
  /** A new installation for an organization; its ID (UUIDv7) is generated here. */
  toEntity(
    organizationId: string,
    installation: GitHubInstallation,
    createdBy: string,
    now: Date,
  ): InstallationEntity {
    return Object.assign(new InstallationEntity(), {
      id: uuidv7(),
      organizationId,
      provider: 'github',
      externalId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      repositorySelection: installation.repositorySelection,
      status: installation.suspended ? 'suspended' : 'active',
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies InstallationEntity);
  }

  toResponse(entity: InstallationEntity): InstallationResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      provider: entity.provider,
      externalId: entity.externalId,
      account: { login: entity.accountLogin, type: entity.accountType },
      repositorySelection: entity.repositorySelection,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }
}
