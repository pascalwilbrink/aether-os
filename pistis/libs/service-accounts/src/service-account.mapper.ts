import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiKeyResponse } from './dto/api-key.response.js';
import type { CreateServiceAccountRequest } from './dto/create-service-account.request.js';
import type { ServiceAccountResponse } from './dto/service-account.response.js';
import { ApiKeyEntity } from './api-key.entity.js';
import { ServiceAccountEntity } from './service-account.entity.js';

@Injectable()
export class ServiceAccountMapper {
  /** A new, active service account; its ID (its `sub`, UUIDv7) is generated here. */
  toEntity(
    dto: CreateServiceAccountRequest,
    organizationId: string,
    createdBy: string,
    now: Date,
  ): ServiceAccountEntity {
    return Object.assign(new ServiceAccountEntity(), {
      id: uuidv7(),
      organizationId,
      name: dto.name,
      description: dto.description,
      status: 'active',
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies ServiceAccountEntity);
  }

  toResponse(entity: ServiceAccountEntity): ServiceAccountResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  apiKeyToEntity(
    values: Pick<
      ApiKeyEntity,
      | 'serviceAccountId'
      | 'name'
      | 'prefix'
      | 'keyHash'
      | 'expiresAt'
      | 'createdBy'
    >,
    now: Date,
  ): ApiKeyEntity {
    return Object.assign(new ApiKeyEntity(), {
      id: uuidv7(),
      ...values,
      lastUsedAt: null,
      createdAt: now,
    } satisfies ApiKeyEntity);
  }

  apiKeyToResponse(entity: ApiKeyEntity): ApiKeyResponse {
    return {
      id: entity.id,
      serviceAccountId: entity.serviceAccountId,
      name: entity.name,
      prefix: entity.prefix,
      expiresAt: entity.expiresAt?.toISOString() ?? null,
      lastUsedAt: entity.lastUsedAt?.toISOString() ?? null,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
