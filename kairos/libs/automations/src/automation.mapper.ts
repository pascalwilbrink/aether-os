import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@kairos/core';

import { AutomationRunEntity, type RunEvent } from './automation-run.entity.js';
import { AutomationEntity } from './automation.entity.js';
import { storedAction, storedTrigger } from './triggers.js';

@Injectable()
export class AutomationMapper {
  /** A new automation, `active`; its ID (UUIDv7) is generated here. */
  toEntity(
    owner: { organizationId: string; projectId: string },
    request: ApiTypes.AutomationRequest,
    createdBy: string,
    now: Date,
  ): AutomationEntity {
    return Object.assign(new AutomationEntity(), {
      id: uuidv7(),
      ...owner,
      name: request.name,
      description: request.description ?? '',
      status: 'active',
      trigger: storedTrigger(request.trigger),
      action: storedAction(request.action),
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies AutomationEntity);
  }

  toResponse(entity: AutomationEntity): ApiTypes.AutomationResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      name: entity.name,
      description: entity.description,
      status: entity.status,
      trigger: entity.trigger,
      action: entity.action,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  /** A run just fired; its ID (UUIDv7) is the command's idempotency key. */
  toRunEntity(
    automation: AutomationEntity,
    sourceEventId: string,
    event: RunEvent,
    now: Date,
  ): AutomationRunEntity {
    return Object.assign(new AutomationRunEntity(), {
      id: uuidv7(),
      automationId: automation.id,
      organizationId: automation.organizationId,
      projectId: automation.projectId,
      status: 'requested',
      sourceEventId,
      event,
      taskId: null,
      rejection: null,
      createdAt: now,
      updatedAt: now,
    } satisfies AutomationRunEntity);
  }

  toRunResponse(entity: AutomationRunEntity): ApiTypes.AutomationRunResponse {
    return {
      id: entity.id,
      automationId: entity.automationId,
      status: entity.status,
      event: entity.event,
      taskId: entity.taskId,
      rejection: entity.rejection,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
