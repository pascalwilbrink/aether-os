import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateTaskRequest } from './dto/create-task.request.js';
import type { TaskResponse } from './dto/task.response.js';
import { TaskEntity } from './task.entity.js';
import type { TaskStatus } from './task-transitions.js';

export interface NewTask {
  dto: CreateTaskRequest;
  organizationId: string;
  projectId: string;
  agentVersionId: string;
  /** The parent's tree, or null for a new top-level task. */
  topLevelTaskId: string | null;
  requestedBy: string;
  idempotencyKey: string;
  status: TaskStatus;
}

@Injectable()
export class TaskMapper {
  /** A new task; its ID (UUIDv7) is generated here. */
  toEntity(task: NewTask, now: Date): TaskEntity {
    const id = uuidv7();
    return Object.assign(new TaskEntity(), {
      id,
      organizationId: task.organizationId,
      projectId: task.projectId,
      parentTaskId: task.dto.parentTaskId ?? null,
      topLevelTaskId: task.topLevelTaskId ?? id,
      title: task.dto.title,
      instructions: task.dto.instructions,
      agentId: task.dto.agentId,
      agentVersionId: task.agentVersionId,
      serviceAccountId: task.dto.serviceAccountId,
      requestedBy: task.requestedBy,
      status: task.status,
      failureReason: null,
      dependsOn: [...new Set(task.dto.dependsOn ?? [])],
      attempt: 1,
      nextAttemptAt: null,
      idempotencyKey: task.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      version: 1,
    } satisfies TaskEntity);
  }

  toResponse(entity: TaskEntity): TaskResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      parentTaskId: entity.parentTaskId,
      topLevelTaskId: entity.topLevelTaskId,
      title: entity.title,
      instructions: entity.instructions,
      agentId: entity.agentId,
      agentVersionId: entity.agentVersionId,
      serviceAccountId: entity.serviceAccountId,
      requestedBy: entity.requestedBy,
      status: entity.status,
      failureReason: entity.failureReason,
      dependsOn: entity.dependsOn,
      attempt: entity.attempt,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      finishedAt: entity.finishedAt?.toISOString() ?? null,
      version: entity.version,
    };
  }
}
