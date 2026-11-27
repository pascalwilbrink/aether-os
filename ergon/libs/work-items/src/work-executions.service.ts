import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import {
  ErgonEvents,
  findPage,
  mapPage,
  OnDomainEvent,
  Transactional,
  type ApiTypes,
  type DomainEvent,
  type HephaestusEvents,
  type Page,
  type PageRequest,
} from '@ergon/core';

import { WorkExecutionEntity } from './entities/index.js';
import { WorkAccess } from './work-access.service.js';
import { WorkActivityService } from './work-activity.service.js';
import { WorkItemMapper } from './work-item.mapper.js';
import { WorkItemStore } from './work-item.store.js';
import { WorkItemsService } from './work-items.service.js';

const FINISHED = ['succeeded', 'failed', 'cancelled'] as const;
type Finished = (typeof FINISHED)[number];

/**
 * The attempts at work (ergon/CLAUDE.md, WorkExecution): Hephaestus's tasks
 * whose `workContext` names a work item, followed from its events
 * (`hephaestus.events`) in their order. Hephaestus stays the source of
 * truth; Ergon never drives a task. When a task starts, its work item moves
 * to `in_progress` (from `backlog` or `todo`); when it succeeds, to
 * `in_review` (from `in_progress`), for a person to decide; a failed or
 * cancelled task changes only its record. Those moves are Ergon's own (no
 * actor).
 */
@Injectable()
export class WorkExecutionsService {
  private readonly logger = new Logger(WorkExecutionsService.name);

  constructor(
    @InjectRepository(WorkExecutionEntity)
    private readonly executions: Repository<WorkExecutionEntity>,
    private readonly items: WorkItemStore,
    private readonly workItems: WorkItemsService,
    private readonly access: WorkAccess,
    private readonly activity: WorkActivityService,
    private readonly events: ErgonEvents,
    private readonly mapper: WorkItemMapper,
  ) {}

  /** Newest first; the work item's read permission. */
  async list(
    organizationId: string,
    workItemId: string,
    page: PageRequest,
  ): Promise<Page<ApiTypes.WorkExecutionResponse>> {
    const item = await this.items.get(organizationId, workItemId);
    this.access.assertCanOnItem(item, 'read');
    const entities = await findPage(
      this.executions,
      {
        where: { organizationId, workItemId },
        sortBy: 'createdAt',
        direction: 'DESC',
      },
      page,
    );
    return mapPage(entities, (entity) =>
      this.mapper.toExecutionResponse(entity),
    );
  }

  /** A task for a work item of the organization: its execution starts. */
  @OnDomainEvent('hephaestus.task.created')
  @Transactional()
  async onTaskCreated(
    event: DomainEvent<HephaestusEvents.TaskCreated>,
  ): Promise<void> {
    const work = event.payload.workContext;
    if (!work || work.organizationId !== event.organizationId) return;
    let item;
    try {
      item = await this.items.get(work.organizationId, work.workItemId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      this.logger.warn(
        `Task ${event.payload.taskId} names work item ${work.workItemId}, which Ergon doesn't have`,
      );
      return;
    }
    const now = new Date();
    const entity = this.mapper.toExecutionEntity(
      item,
      {
        taskId: event.payload.taskId,
        agentId: work.agentId,
        agentVersionId: event.payload.agentVersionId,
        status: event.payload.status,
        taskVersion: event.aggregateVersion,
      },
      now,
    );
    const inserted: unknown[] = (
      await this.executions
        .createQueryBuilder()
        .insert()
        .values(entity)
        .orIgnore()
        .returning('id')
        .execute()
    ).raw;
    if (inserted.length === 0) return;
    await this.activity.record(
      item,
      'execution_started',
      null,
      {
        executionId: entity.id,
        taskId: entity.taskId,
        agentId: entity.agentId,
      },
      now,
    );
    await this.events.emit({
      eventType: 'work-execution.started',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: item.organizationId,
      projectId: item.projectId,
      payload: this.mapper.toExecutionPayload(entity),
    });
    await this.workItems.advance(
      item.organizationId,
      item.id,
      ['plan', 'start'],
      `Its agent started on it (task ${entity.taskId})`,
    );
  }

  /** The task's status, newer than what the execution has; a retry reopens it. */
  @OnDomainEvent('hephaestus.task.status-changed')
  @Transactional()
  async onTaskStatusChanged(
    event: DomainEvent<HephaestusEvents.TaskStatusChanged>,
  ): Promise<void> {
    const entity = await this.lockFor(event);
    if (!entity || event.aggregateVersion <= entity.taskVersion) return;
    entity.status = event.payload.to;
    entity.taskVersion = event.aggregateVersion;
    if (!(FINISHED as readonly string[]).includes(event.payload.to)) {
      // Retried: running again.
      entity.finishedAt = null;
      entity.failureReason = null;
      entity.primaryArtifactId = null;
    }
    entity.updatedAt = new Date();
    await this.executions.save(entity);
  }

  @OnDomainEvent('hephaestus.task.succeeded')
  @Transactional()
  async onTaskSucceeded(
    event: DomainEvent<HephaestusEvents.TaskSucceeded>,
  ): Promise<void> {
    await this.finish(event, 'succeeded', {
      primaryArtifactId: event.payload.primaryArtifactId,
    });
  }

  @OnDomainEvent('hephaestus.task.failed')
  @Transactional()
  async onTaskFailed(
    event: DomainEvent<HephaestusEvents.TaskFailed>,
  ): Promise<void> {
    await this.finish(event, 'failed', {
      failureReason: event.payload.failureReason,
    });
  }

  @OnDomainEvent('hephaestus.task.cancelled')
  @Transactional()
  async onTaskCancelled(
    event: DomainEvent<HephaestusEvents.TaskCancelled>,
  ): Promise<void> {
    await this.finish(event, 'cancelled', {});
  }

  /**
   * Records how the task ended, once per ending (a retried task can end
   * again), and for a success moves the work to `in_review`.
   */
  private async finish(
    event: DomainEvent<{ taskId: string }>,
    status: Finished,
    outcome: Partial<
      Pick<WorkExecutionEntity, 'failureReason' | 'primaryArtifactId'>
    >,
  ): Promise<void> {
    const entity = await this.lockFor(event);
    if (!entity || event.aggregateVersion < entity.taskVersion) return;
    if (entity.finishedAt && entity.status === status) return;
    const now = new Date();
    Object.assign(entity, {
      status,
      failureReason: outcome.failureReason ?? null,
      primaryArtifactId: outcome.primaryArtifactId ?? null,
      taskVersion: event.aggregateVersion,
      version: entity.version + 1,
      updatedAt: now,
      finishedAt: now,
    });
    await this.executions.save(entity);
    const item = await this.items.get(entity.organizationId, entity.workItemId);
    await this.activity.record(
      item,
      'execution_finished',
      null,
      {
        executionId: entity.id,
        taskId: entity.taskId,
        agentId: entity.agentId,
        status,
        failureReason: entity.failureReason,
      },
      now,
    );
    await this.events.emit({
      eventType: 'work-execution.completed',
      aggregateId: entity.id,
      aggregateVersion: entity.version,
      organizationId: item.organizationId,
      projectId: item.projectId,
      payload: this.mapper.toExecutionPayload(entity),
    });
    if (status === 'succeeded') {
      await this.workItems.advance(
        item.organizationId,
        item.id,
        ['submit'],
        `Its agent's task succeeded (task ${entity.taskId}); a person decides whether it's done`,
      );
    }
  }

  /** The execution of the event's task, locked; null for other tasks. */
  private lockFor(
    event: DomainEvent<{ taskId: string }>,
  ): Promise<WorkExecutionEntity | null> {
    if (!event.organizationId) return Promise.resolve(null);
    return this.executions.findOne({
      where: {
        taskId: event.payload.taskId,
        organizationId: event.organizationId,
      },
      lock: { mode: 'pessimistic_write' },
    });
  }
}
