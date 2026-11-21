import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { ApiTypes } from '@hephaestus/core';

import type { CreateTaskRequest } from './dto/create-task.request.js';
import type { TaskResponse } from './dto/task.response.js';
import type { PinnedKnowledge } from './task-context.js';
import type { TaskBrief } from './task-fields.js';
import { fillUntrusted } from './untrusted-inputs.js';
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
  /** The repository link it works in: the request's, else the parent's. */
  repositoryLinkId: string | null;
  /** Set when it comes from a template. */
  template?: TaskTemplateOrigin;
  /** The knowledge pinned on it, at the versions it got. */
  context: PinnedKnowledge[];
  /** Its brief, checked (`taskBriefOf`). */
  brief: TaskBrief;
}

/** The template version a task comes from, and the criteria it brings. */
export interface TaskTemplateOrigin {
  templateId: string;
  version: number;
  acceptanceCriteria: ApiTypes.AcceptanceCriterionRequest[];
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
      instructions: task.brief.description,
      requirements: task.brief.requirements,
      expectedOutcome: task.brief.expectedOutcome,
      constraints: task.brief.constraints,
      deliverables: task.brief.deliverables,
      untrustedInputs: task.brief.untrustedInputs,
      agentId: task.dto.agentId,
      agentVersionId: task.agentVersionId,
      serviceAccountId: task.dto.serviceAccountId,
      requestedBy: task.requestedBy,
      status: task.status,
      failureReason: null,
      pausedFor: null,
      dependsOn: [...new Set(task.dto.dependsOn ?? [])],
      reviewArtifactKinds: [...new Set(task.dto.review?.artifactKinds ?? [])],
      reviewRound: 0,
      acceptanceCriteria: [
        ...(task.template?.acceptanceCriteria ?? []).map((criterion) => ({
          ...criterion,
          source: 'template' as const,
        })),
        ...(task.dto.acceptanceCriteria ?? []).map((criterion) => ({
          ...criterion,
          source: 'task' as const,
        })),
        ...task.brief.deliverableCriteria,
      ],
      repositoryLinkId: task.repositoryLinkId,
      concurrencyKey: task.dto.concurrency?.key ?? null,
      concurrencyPolicy: task.dto.concurrency?.policy ?? null,
      inputFileIds: [
        ...new Set((task.dto.inputFiles ?? []).map((file) => file.fileId)),
      ],
      context: task.context.map(contextOf),
      contextContent: task.context,
      taskTemplateId: task.template?.templateId ?? null,
      taskTemplateVersion: task.template?.version ?? null,
      attempt: 1,
      nextAttemptAt: null,
      deliveryAttempts: 0,
      branchCleanupAt: null,
      primaryArtifactId: null,
      idempotencyKey: task.idempotencyKey,
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
      version: 1,
    } satisfies TaskEntity);
  }

  toResponse(entity: TaskEntity): TaskResponse {
    // People read the text with the outside text filled in.
    const fill = (text: string) => fillUntrusted(text, entity.untrustedInputs);
    const items = (list: ApiTypes.TaskItem[]) =>
      list.map((item) => ({ ...item, description: fill(item.description) }));
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      projectId: entity.projectId,
      parentTaskId: entity.parentTaskId,
      topLevelTaskId: entity.topLevelTaskId,
      title: fill(entity.title),
      description: fill(entity.instructions),
      instructions: fill(entity.instructions),
      requirements: items(entity.requirements),
      expectedOutcome:
        entity.expectedOutcome === null ? null : fill(entity.expectedOutcome),
      constraints: items(entity.constraints),
      deliverables: entity.deliverables.map((deliverable) => ({
        ...deliverable,
        description: fill(deliverable.description),
      })),
      untrustedInputs: entity.untrustedInputs,
      agentId: entity.agentId,
      agentVersionId: entity.agentVersionId,
      serviceAccountId: entity.serviceAccountId,
      requestedBy: entity.requestedBy,
      status: entity.status,
      failureReason: entity.failureReason,
      pausedFor: entity.pausedFor,
      dependsOn: entity.dependsOn,
      attempt: entity.attempt,
      primaryArtifactId: entity.primaryArtifactId,
      review: { artifactKinds: entity.reviewArtifactKinds },
      reviewRound: entity.reviewRound,
      acceptanceCriteria: entity.acceptanceCriteria,
      repository: entity.repositoryLinkId
        ? { linkId: entity.repositoryLinkId }
        : null,
      concurrency:
        entity.concurrencyKey && entity.concurrencyPolicy
          ? { key: entity.concurrencyKey, policy: entity.concurrencyPolicy }
          : null,
      inputFiles: entity.inputFileIds.map((fileId) => ({ fileId })),
      context: entity.context,
      taskTemplateId: entity.taskTemplateId,
      taskTemplateVersion: entity.taskTemplateVersion,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      finishedAt: entity.finishedAt?.toISOString() ?? null,
      version: entity.version,
    };
  }
}

/** What the API shows of a pinned item: which one, at which version. */
function contextOf(pinned: PinnedKnowledge): ApiTypes.PinnedTaskContext {
  return {
    kind: pinned.kind,
    itemId: pinned.itemId,
    version: pinned.version,
    type: pinned.type,
    title: pinned.title,
  };
}
