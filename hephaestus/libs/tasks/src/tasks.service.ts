import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ArrayContains, In, type Repository } from 'typeorm';

import {
  AccessControl,
  findPage,
  HephaestusEvents,
  isUniqueViolation,
  mapPage,
  Transactional,
  type Page,
} from '@hephaestus/core';
import { AgentsService } from '@hephaestus/agents';
import { OrganizationsService, ProjectsService } from '@hephaestus/tenancy';

import type { CreateTaskRequest } from './dto/create-task.request.js';
import type { ListTasksQuery } from './dto/list-tasks.query.js';
import type { TaskResponse } from './dto/task.response.js';
import { TaskEntity } from './task.entity.js';
import {
  InvalidTaskDependencyError,
  InvalidTaskTransitionError,
  TaskParentFinishedError,
} from './task.errors.js';
import { TaskMapper } from './task.mapper.js';
import {
  isTerminal,
  nextTaskStatus,
  type TaskAction,
  type TaskFailureReason,
  type TaskStatus,
} from './task-transitions.js';

/**
 * Tasks and subtasks (docs/tasks.md): created with an idempotency key, the
 * agent version pinned, `dependsOn` within one tree; their lifecycle is
 * `task-transitions.ts`. Every change emits its events in the same
 * transaction (outbox). People cancel and retry; the runner (to come) moves
 * tasks through the rest with `transition`.
 */
@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    private readonly mapper: TaskMapper,
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectsService,
    private readonly agents: AgentsService,
    private readonly events: HephaestusEvents,
    private readonly access: AccessControl,
  ) {}

  /**
   * A new task, or the one this idempotency key already created (`created:
   * false`), so a retried request or a redelivered command never starts the
   * same task twice.
   */
  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    dto: CreateTaskRequest,
    idempotencyKey: string,
  ): Promise<{ task: TaskResponse; created: boolean }> {
    const existing = await this.tasks.findOneBy({
      organizationId,
      idempotencyKey,
    });
    if (existing) {
      return { task: this.mapper.toResponse(existing), created: false };
    }

    await this.projects.assertAcceptsWrites(organizationId, projectId);
    const agentVersionId = await this.agents.publishedVersion(
      organizationId,
      dto.agentId,
    );

    let topLevelTaskId: string | null = null;
    if (dto.parentTaskId) {
      const parent = await this.load(
        organizationId,
        projectId,
        dto.parentTaskId,
      );
      if (isTerminal(parent.status)) {
        throw new TaskParentFinishedError(parent.id);
      }
      topLevelTaskId = parent.topLevelTaskId;
    }
    const dependsOn = [...new Set(dto.dependsOn ?? [])];
    const ready = await this.dependenciesSucceeded(
      organizationId,
      topLevelTaskId,
      dependsOn,
    );

    const entity = this.mapper.toEntity(
      {
        dto,
        organizationId,
        projectId,
        agentVersionId,
        topLevelTaskId,
        requestedBy: this.access.principal().sub,
        idempotencyKey,
        status: ready ? 'queued' : 'blocked',
      },
      new Date(),
    );
    try {
      await this.tasks.insert(entity);
    } catch (error) {
      // Two requests with the same key at once: the other one won.
      if (isUniqueViolation(error)) {
        const winner = await this.tasks.findOneByOrFail({
          organizationId,
          idempotencyKey,
        });
        return { task: this.mapper.toResponse(winner), created: false };
      }
      throw error;
    }
    await this.events.emit({
      eventType: 'task.created',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId,
      projectId,
      payload: {
        taskId: entity.id,
        parentTaskId: entity.parentTaskId,
        topLevelTaskId: entity.topLevelTaskId,
        agentId: entity.agentId,
        agentVersionId: entity.agentVersionId,
        serviceAccountId: entity.serviceAccountId,
        requestedBy: entity.requestedBy,
        idempotencyKey,
        status: entity.status,
      },
    });

    return { task: this.mapper.toResponse(entity), created: true };
  }

  async list(
    organizationId: string,
    projectId: string,
    query: ListTasksQuery,
  ): Promise<Page<TaskResponse>> {
    await this.organizations.assertExists(organizationId);
    const { parentTaskId, status, ...page } = query;
    const entities = await findPage(
      this.tasks,
      {
        where: {
          organizationId,
          projectId,
          ...(parentTaskId ? { parentTaskId } : {}),
          ...(status ? { status } : {}),
        },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) => this.mapper.toResponse(entity));
  }

  async findById(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskResponse> {
    await this.organizations.assertExists(organizationId);
    return this.mapper.toResponse(
      await this.load(organizationId, projectId, taskId),
    );
  }

  /**
   * Cancels the task and every unfinished task under it (docs/tasks.md,
   * Cancellation). Idempotent; a succeeded or failed task stays as it is
   * (`TASK_INVALID_TRANSITION`). A suspended organization can still cancel.
   */
  @Transactional()
  async cancel(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskResponse> {
    await this.organizations.assertExists(organizationId);
    const task = await this.load(organizationId, projectId, taskId, true);
    if (task.status === 'cancelled') {
      return this.mapper.toResponse(task);
    }
    if (!nextTaskStatus(task.status, 'cancel')) {
      throw new InvalidTaskTransitionError(task.id, task.status, 'cancel');
    }
    const cancelledBy = this.access.optionalPrincipal()?.sub ?? null;
    await this.apply(task, 'cancelled', 'cancelled', null, cancelledBy);
    for (const descendant of await this.unfinishedDescendants(task)) {
      await this.apply(
        descendant,
        'cancelled',
        'cancelled-with-parent',
        null,
        cancelledBy,
      );
    }
    return this.mapper.toResponse(task);
  }

  /**
   * Retries a failed task: a new attempt of the same task with the same
   * pinned inputs, `queued` (or `blocked` until its dependencies succeed).
   */
  @Transactional()
  async retry(
    organizationId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskResponse> {
    await this.projects.assertAcceptsWrites(organizationId, projectId);
    const task = await this.load(organizationId, projectId, taskId, true);
    if (!nextTaskStatus(task.status, 'retry')) {
      throw new InvalidTaskTransitionError(task.id, task.status, 'retry');
    }
    const ready = await this.dependenciesSucceeded(
      organizationId,
      task.topLevelTaskId,
      task.dependsOn,
    );
    task.attempt += 1;
    task.finishedAt = null;
    task.nextAttemptAt = null;
    await this.apply(task, ready ? 'queued' : 'blocked', 'retry', null, null);
    return this.mapper.toResponse(task);
  }

  /**
   * Moves a task through its lifecycle (the runner; no HTTP route). On
   * success, its dependents whose dependencies have all succeeded become
   * `queued`. `requeue` takes `notBefore` (the backoff); `reason` replaces
   * the action in `task.status-changed`.
   */
  @Transactional()
  async transition(
    organizationId: string,
    taskId: string,
    action: Exclude<TaskAction, 'cancel' | 'retry'>,
    failureReason: TaskFailureReason | null = null,
    options: {
      notBefore?: Date;
      reason?: string;
      /** Required to `succeed`: the artifacts it produced. */
      outcome?: { primaryArtifactId: string; artifactIds: string[] };
      /** Required to `await-review`: the drafts waiting. */
      draftArtifactIds?: string[];
    } = {},
  ): Promise<TaskResponse> {
    const task = await this.tasks.findOne({
      where: { id: taskId, organizationId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    const next = nextTaskStatus(task.status, action);
    if (!next) {
      throw new InvalidTaskTransitionError(task.id, task.status, action);
    }
    if (next === 'failed' && !failureReason) {
      throw new Error('A failed task needs a failure reason');
    }
    if (next === 'succeeded') {
      if (!options.outcome) {
        throw new Error('A succeeded task needs its primary artifact');
      }
      task.primaryArtifactId = options.outcome.primaryArtifactId;
    }
    if (next === 'awaiting_review') {
      if (!options.draftArtifactIds?.length) {
        throw new Error('A task awaiting review needs its drafts');
      }
      task.reviewRound += 1;
    }
    // Only a requeued task waits (backoff); anything else starts afresh.
    task.nextAttemptAt =
      action === 'requeue' ? (options.notBefore ?? null) : null;
    await this.apply(
      task,
      next,
      options.reason ?? failureReason ?? action,
      next === 'failed' ? failureReason : null,
      null,
      options.outcome?.artifactIds ?? options.draftArtifactIds ?? [],
    );
    if (next === 'succeeded') {
      await this.unblockDependents(task);
    }
    return this.mapper.toResponse(task);
  }

  /** A task's status, for the runner (no tenancy check); null if unknown. */
  async statusOf(
    organizationId: string,
    taskId: string,
  ): Promise<TaskStatus | null> {
    const task = await this.tasks.findOne({
      where: { id: taskId, organizationId },
      select: { id: true, status: true },
    });
    return task?.status ?? null;
  }

  /** Sets the status, bumps the version and emits the events for it. */
  private async apply(
    task: TaskEntity,
    to: TaskStatus,
    reason: string | null,
    failureReason: TaskFailureReason | null,
    cancelledBy: string | null,
    artifactIds: string[] = [],
  ): Promise<void> {
    const from = task.status;
    const now = new Date();
    task.status = to;
    task.failureReason = failureReason;
    task.updatedAt = now;
    if (isTerminal(to)) {
      task.finishedAt = now;
    }
    task.version += 1;
    await this.tasks.save(task);

    const base = {
      aggregateId: task.id,
      aggregateVersion: task.version,
      organizationId: task.organizationId,
      projectId: task.projectId,
    };
    await this.events.emit({
      ...base,
      eventType: 'task.status-changed',
      payload: { taskId: task.id, from, to, reason },
    });
    if (to === 'succeeded') {
      await this.events.emit({
        ...base,
        eventType: 'task.succeeded',
        payload: {
          taskId: task.id,
          topLevelTaskId: task.topLevelTaskId,
          requestedBy: task.requestedBy,
          primaryArtifactId: task.primaryArtifactId!,
          artifactIds,
        },
      });
    } else if (to === 'failed' && failureReason) {
      await this.events.emit({
        ...base,
        eventType: 'task.failed',
        payload: {
          taskId: task.id,
          topLevelTaskId: task.topLevelTaskId,
          requestedBy: task.requestedBy,
          failureReason,
        },
      });
    } else if (to === 'awaiting_review') {
      await this.events.emit({
        ...base,
        eventType: 'task.awaiting-review',
        payload: {
          taskId: task.id,
          topLevelTaskId: task.topLevelTaskId,
          requestedBy: task.requestedBy,
          draftArtifactIds: artifactIds,
          round: task.reviewRound,
        },
      });
    } else if (to === 'cancelled') {
      await this.events.emit({
        ...base,
        eventType: 'task.cancelled',
        payload: {
          taskId: task.id,
          topLevelTaskId: task.topLevelTaskId,
          cancelledBy,
        },
      });
    }
  }

  /**
   * Whether every dependency has succeeded. They must exist under the same
   * top-level task (docs/tasks.md: same tree), so a new top-level task
   * (`topLevelTaskId` null) can't have any.
   */
  private async dependenciesSucceeded(
    organizationId: string,
    topLevelTaskId: string | null,
    dependsOn: string[],
  ): Promise<boolean> {
    if (dependsOn.length === 0) {
      return true;
    }
    if (!topLevelTaskId) {
      throw new InvalidTaskDependencyError(
        'A top-level task has nothing to depend on in its tree',
      );
    }
    const found = await this.tasks.find({
      where: { organizationId, id: In(dependsOn) },
      select: { id: true, topLevelTaskId: true, status: true },
    });
    if (
      found.length !== dependsOn.length ||
      found.some((t) => t.topLevelTaskId !== topLevelTaskId)
    ) {
      throw new InvalidTaskDependencyError(
        'Tasks can only depend on tasks under the same top-level task',
      );
    }
    return found.every((t) => t.status === 'succeeded');
  }

  /** Blocked tasks waiting on `task` whose dependencies have now all succeeded. */
  private async unblockDependents(task: TaskEntity): Promise<void> {
    const dependents = await this.tasks.find({
      where: {
        organizationId: task.organizationId,
        topLevelTaskId: task.topLevelTaskId,
        status: 'blocked',
        dependsOn: ArrayContains([task.id]),
      },
      lock: { mode: 'pessimistic_write' },
    });
    for (const dependent of dependents) {
      if (
        await this.dependenciesSucceeded(
          task.organizationId,
          dependent.topLevelTaskId,
          dependent.dependsOn,
        )
      ) {
        await this.apply(dependent, 'queued', 'dependencies-met', null, null);
      }
    }
  }

  /** Every unfinished task under `task`, parents before children. */
  private async unfinishedDescendants(task: TaskEntity): Promise<TaskEntity[]> {
    const tree = await this.tasks.find({
      where: {
        organizationId: task.organizationId,
        topLevelTaskId: task.topLevelTaskId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    const children = new Map<string, TaskEntity[]>();
    for (const node of tree) {
      if (node.parentTaskId) {
        children.set(node.parentTaskId, [
          ...(children.get(node.parentTaskId) ?? []),
          node,
        ]);
      }
    }
    const result: TaskEntity[] = [];
    const queue = [...(children.get(task.id) ?? [])];
    while (queue.length) {
      const node = queue.shift()!;
      if (!isTerminal(node.status)) {
        result.push(node);
      }
      queue.push(...(children.get(node.id) ?? []));
    }
    return result;
  }

  /** Scoped to the organization and project: another one's task is a 404. */
  private async load(
    organizationId: string,
    projectId: string,
    taskId: string,
    forUpdate = false,
  ): Promise<TaskEntity> {
    const entity = await this.tasks.findOne({
      where: { id: taskId, organizationId, projectId },
      ...(forUpdate ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    return entity;
  }
}
