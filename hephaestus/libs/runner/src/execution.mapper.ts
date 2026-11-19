import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

import type { ExecutionResponse } from './dto/execution.response.js';
import { ExecutionEntity } from './execution.entity.js';

const NO_USAGE: ApiTypes.ExecutionUsage = {
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: null,
};

@Injectable()
export class ExecutionMapper {
  /** A new execution of a task that was just claimed; its ID (UUIDv7) here. */
  toEntity(
    task: TaskResponse,
    number: number,
    runnerId: string,
    now: Date,
  ): ExecutionEntity {
    return Object.assign(new ExecutionEntity(), {
      id: uuidv7(),
      organizationId: task.organizationId,
      projectId: task.projectId,
      taskId: task.id,
      attempt: task.attempt,
      number,
      status: 'provisioning',
      failureReason: null,
      error: null,
      summary: null,
      runnerId,
      sandboxReference: null,
      repository: null,
      startedAt: now,
      heartbeatAt: now,
      deadlineAt: null,
      endedAt: null,
    } satisfies ExecutionEntity);
  }

  toResponse(
    entity: ExecutionEntity,
    usage: ApiTypes.ExecutionUsage = NO_USAGE,
    sandbox: ApiTypes.ExecutionSandbox | null = null,
  ): ExecutionResponse {
    return {
      id: entity.id,
      taskId: entity.taskId,
      attempt: entity.attempt,
      number: entity.number,
      status: entity.status,
      failureReason: entity.failureReason,
      error: entity.error,
      summary: entity.summary,
      usage,
      repository: entity.repository,
      sandbox,
      startedAt: entity.startedAt.toISOString(),
      endedAt: entity.endedAt?.toISOString() ?? null,
    };
  }
}
