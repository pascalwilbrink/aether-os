import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes, ErgonEventPayloads } from '@ergon/core';

import {
  WorkActivityEntity,
  WorkAssignmentEntity,
  WorkDependencyEntity,
  WorkItemEntity,
  type ActivityValue,
} from './entities/index.js';

type Assignee = ApiTypes.Assignee & { versionId: string | null };
type Snapshot = ErgonEventPayloads['work-item.created']['workItem'];

/** The content `PUT` replaces, with every optional field filled in. */
export type WorkItemContent = Pick<
  WorkItemEntity,
  | 'type'
  | 'title'
  | 'description'
  | 'priority'
  | 'needsReview'
  | 'requirements'
  | 'expectedOutcome'
  | 'constraints'
  | 'acceptanceCriteria'
  | 'dueAt'
>;

export const CONTENT_FIELDS: readonly (keyof WorkItemContent)[] = [
  'type',
  'title',
  'description',
  'priority',
  'needsReview',
  'requirements',
  'expectedOutcome',
  'constraints',
  'acceptanceCriteria',
  'dueAt',
];

@Injectable()
export class WorkItemMapper {
  content(request: ApiTypes.WorkItemUpdate): WorkItemContent {
    return {
      type: request.type,
      title: request.title,
      description: request.description ?? '',
      priority: request.priority ?? 'medium',
      needsReview: request.needsReview ?? false,
      requirements: request.requirements ?? [],
      expectedOutcome: request.expectedOutcome ?? null,
      constraints: request.constraints ?? [],
      acceptanceCriteria: request.acceptanceCriteria ?? [],
      dueAt: request.dueAt ? new Date(request.dueAt) : null,
    };
  }

  /** A new work item; its ID (UUIDv7) is generated here. */
  toEntity(
    owner: {
      organizationId: string;
      projectId: string | null;
      parentId: string | null;
    },
    request: ApiTypes.WorkItemRequest,
    source: WorkItemEntity['source'],
    createdBy: ApiTypes.Actor,
    now: Date,
  ): WorkItemEntity {
    return Object.assign(new WorkItemEntity(), {
      id: uuidv7(),
      ...owner,
      ...this.content(request),
      status: request.status ?? 'backlog',
      startedAt: null,
      completedAt: null,
      source,
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies WorkItemEntity);
  }

  toResponse(
    entity: WorkItemEntity,
    responsible: Assignee | null,
    blocked: boolean,
  ): ApiTypes.WorkItemResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      parentId: entity.parentId,
      type: entity.type,
      title: entity.title,
      description: entity.description,
      status: entity.status,
      blocked,
      priority: entity.priority,
      needsReview: entity.needsReview,
      requirements: entity.requirements,
      expectedOutcome: entity.expectedOutcome,
      constraints: entity.constraints,
      acceptanceCriteria: entity.acceptanceCriteria,
      dueAt: entity.dueAt?.toISOString() ?? null,
      startedAt: entity.startedAt?.toISOString() ?? null,
      completedAt: entity.completedAt?.toISOString() ?? null,
      source: entity.source,
      responsible,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }

  /** The work item in events (its text fields left out). */
  toSnapshot(entity: WorkItemEntity): Snapshot {
    return {
      id: entity.id,
      parentId: entity.parentId,
      type: entity.type,
      title: entity.title,
      status: entity.status,
      priority: entity.priority,
      needsReview: entity.needsReview,
      dueAt: entity.dueAt?.toISOString() ?? null,
      source: entity.source,
    };
  }

  toAssignmentEntity(
    item: WorkItemEntity,
    request: ApiTypes.WorkAssignmentRequest,
    assignedBy: ApiTypes.Actor,
    now: Date,
  ): WorkAssignmentEntity {
    return Object.assign(new WorkAssignmentEntity(), {
      id: uuidv7(),
      organizationId: item.organizationId,
      workItemId: item.id,
      assigneeKind: request.assignee.kind,
      assigneeId: request.assignee.id,
      assigneeVersionId: request.assignee.versionId ?? null,
      role: request.role,
      status: 'active',
      reason: request.reason ?? null,
      assignedBy,
      startedAt: now,
      endedAt: null,
      endedBy: null,
      endReason: null,
      version: 1,
    } satisfies WorkAssignmentEntity);
  }

  assignee(entity: WorkAssignmentEntity): Assignee {
    return {
      kind: entity.assigneeKind,
      id: entity.assigneeId,
      versionId: entity.assigneeVersionId,
    };
  }

  toAssignmentResponse(
    entity: WorkAssignmentEntity,
  ): ApiTypes.WorkAssignmentResponse {
    return {
      id: entity.id,
      workItemId: entity.workItemId,
      assignee: this.assignee(entity),
      role: entity.role,
      status: entity.status,
      reason: entity.reason,
      assignedBy: entity.assignedBy,
      startedAt: entity.startedAt.toISOString(),
      endedAt: entity.endedAt?.toISOString() ?? null,
      endedBy: entity.endedBy,
      endReason: entity.endReason,
    };
  }

  toDependencyEntity(
    organizationId: string,
    edge: Pick<
      WorkDependencyEntity,
      'kind' | 'fromWorkItemId' | 'toWorkItemId'
    >,
    createdBy: ApiTypes.Actor,
    now: Date,
  ): WorkDependencyEntity {
    return Object.assign(new WorkDependencyEntity(), {
      id: uuidv7(),
      organizationId,
      ...edge,
      createdBy,
      createdAt: now,
    } satisfies WorkDependencyEntity);
  }

  toDependencyResponse(
    entity: WorkDependencyEntity,
  ): ApiTypes.WorkDependencyResponse {
    return {
      id: entity.id,
      kind: entity.kind,
      fromWorkItemId: entity.fromWorkItemId,
      toWorkItemId: entity.toWorkItemId,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  toActivityEntity(
    item: Pick<WorkItemEntity, 'id' | 'organizationId'>,
    kind: ApiTypes.WorkActivityKind,
    actor: ApiTypes.Actor | null,
    details: Record<string, ActivityValue>,
    now: Date,
  ): WorkActivityEntity {
    return Object.assign(new WorkActivityEntity(), {
      id: uuidv7(),
      organizationId: item.organizationId,
      workItemId: item.id,
      kind,
      actor,
      details,
      createdAt: now,
    } satisfies WorkActivityEntity);
  }

  toActivityResponse(
    entity: WorkActivityEntity,
  ): ApiTypes.WorkActivityResponse {
    return {
      id: entity.id,
      workItemId: entity.workItemId,
      kind: entity.kind,
      actor: entity.actor,
      details: entity.details,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
