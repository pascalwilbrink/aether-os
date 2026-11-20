import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import { ModelKeyEntity, type ModelKeyScope } from './model-key.entity.js';

@Injectable()
export class ModelKeyMapper {
  /** A key just set; its ID (UUIDv7) is generated here. */
  toEntity(
    organizationId: string,
    scope: ModelKeyScope,
    scopeId: string,
    provider: string,
    now: Date,
  ): ModelKeyEntity {
    return Object.assign(new ModelKeyEntity(), {
      id: uuidv7(),
      organizationId,
      scope,
      scopeId,
      provider,
      hint: null,
      baseUrl: null,
      updatedBy: '',
      createdAt: now,
      updatedAt: now,
    } satisfies ModelKeyEntity);
  }

  toResponse(entity: ModelKeyEntity): ApiTypes.ModelKeyResponse {
    return {
      provider: entity.provider as ApiTypes.ModelProvider,
      scope: entity.scope,
      agentId: entity.scope === 'agent' ? entity.scopeId : null,
      hint: entity.hint,
      baseUrl: entity.baseUrl,
      updatedBy: entity.updatedBy,
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/** The last four characters, to tell keys apart without showing them. */
export const hintOf = (apiKey: string) => `…${apiKey.trim().slice(-4)}`;
