import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import { ToolServerEntity } from './tool-server.entity.js';

@Injectable()
export class ToolServerMapper {
  /** A new tool server; its ID (UUIDv7) is generated here. */
  toEntity(
    organizationId: string,
    dto: ApiTypes.CreateToolServerRequest,
    createdBy: string,
    now: Date,
  ): ToolServerEntity {
    return Object.assign(new ToolServerEntity(), {
      id: uuidv7(),
      organizationId,
      name: dto.name,
      description: dto.description ?? '',
      url: dto.url,
      authType: dto.auth.type,
      headerName: headerNameOf(dto.auth),
      credentialHint: null,
      credentialUpdatedBy: null,
      credentialUpdatedAt: null,
      createdBy,
      createdAt: now,
      updatedAt: now,
    } satisfies ToolServerEntity);
  }

  toResponse(entity: ToolServerEntity): ApiTypes.ToolServerResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      description: entity.description,
      url: entity.url,
      auth: { type: entity.authType, headerName: entity.headerName },
      credential:
        entity.credentialHint && entity.credentialUpdatedAt
          ? {
              hint: entity.credentialHint,
              updatedBy: entity.credentialUpdatedBy ?? '',
              updatedAt: entity.credentialUpdatedAt.toISOString(),
            }
          : null,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}

/** The header a `header` server's credential goes in; none otherwise. */
export function headerNameOf(auth: ApiTypes.ToolServerAuth): string | null {
  return auth.type === 'header' ? (auth.headerName ?? 'Authorization') : null;
}

/** The last four characters, to tell credentials apart without showing them. */
export const hintOf = (value: string) => `…${value.trim().slice(-4)}`;
