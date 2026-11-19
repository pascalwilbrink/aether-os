import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateWorkspaceRequest } from './dto/create-workspace.request.js';
import type { WorkspaceResponse } from './dto/workspace.response.js';
import { WorkspaceEntity } from './workspace.entity.js';

@Injectable()
export class WorkspaceMapper {
  /** A new, requested workspace; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateWorkspaceRequest,
    organizationId: string,
    now: Date,
  ): WorkspaceEntity {
    return Object.assign(new WorkspaceEntity(), {
      id: uuidv7(),
      organizationId,
      projectId: dto.projectId,
      executionId: dto.executionId,
      status: 'requested',
      repository: dto.repository ?? null,
      sandbox: dto.sandbox,
      sandboxReference: null,
      workingDirectory: dto.workingDirectory,
      blockedHosts: [],
      failureReason: null,
      expiresAt: new Date(dto.expiresAt),
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      destroyedAt: null,
    } satisfies WorkspaceEntity);
  }

  toResponse(entity: WorkspaceEntity): WorkspaceResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      executionId: entity.executionId,
      status: entity.status,
      repository: entity.repository,
      sandbox: entity.sandbox,
      sandboxReference: entity.sandboxReference,
      workingDirectory: entity.workingDirectory,
      blockedHosts: entity.blockedHosts,
      failureReason: entity.failureReason,
      expiresAt: entity.expiresAt.toISOString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      startedAt: entity.startedAt?.toISOString() ?? null,
      destroyedAt: entity.destroyedAt?.toISOString() ?? null,
    };
  }
}
