import { Injectable } from '@nestjs/common';

import type {
  ExecutionId,
  OrganizationId,
  ProjectId,
  WorkspaceId,
} from '@hephaestus/core';

import { Workspace } from '../../../domain/workspace.js';
import { WorkspaceEntity } from '../entity/workspace.entity.js';

@Injectable()
export class WorkspaceMapper {
  toEntity(workspace: Workspace): WorkspaceEntity {
    return Object.assign(new WorkspaceEntity(), {
      id: workspace.id,
      organizationId: workspace.organizationId,
      projectId: workspace.projectId,
      executionId: workspace.executionId,
      repository: workspace.repository,
      sandbox: workspace.sandbox,
      workingDirectory: workspace.workingDirectory,
      expiresAt: workspace.expiresAt,
      status: workspace.status,
      sandboxReference: workspace.sandboxReference,
      failureReason: workspace.failureReason,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      startedAt: workspace.startedAt,
      destroyedAt: workspace.destroyedAt,
    } satisfies WorkspaceEntity);
  }

  toDomain(entity: WorkspaceEntity): Workspace {
    return Workspace.reconstitute({
      id: entity.id as WorkspaceId,
      organizationId: entity.organizationId as OrganizationId,
      projectId: entity.projectId as ProjectId,
      executionId: entity.executionId as ExecutionId,
      repository: entity.repository,
      sandbox: entity.sandbox,
      workingDirectory: entity.workingDirectory,
      expiresAt: entity.expiresAt,
      status: entity.status,
      sandboxReference: entity.sandboxReference,
      failureReason: entity.failureReason,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      startedAt: entity.startedAt,
      destroyedAt: entity.destroyedAt,
    });
  }
}
