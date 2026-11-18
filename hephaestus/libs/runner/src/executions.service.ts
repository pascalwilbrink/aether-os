import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, type Repository } from 'typeorm';

import { findPage, mapPage, Transactional, type Page } from '@hephaestus/core';
import { ModelGateway } from '@hephaestus/models';
import {
  InvalidTaskTransitionError,
  TaskQueue,
  TasksService,
  type TaskFailureReason,
  type TaskResponse,
  type TaskStatus,
} from '@hephaestus/tasks';

import type { ExecutionResponse } from './dto/execution.response.js';
import type { ListExecutionsQuery } from './dto/list-executions.query.js';
import {
  ACTIVE_EXECUTION,
  ExecutionEntity,
  type ExecutionStatus,
} from './execution.entity.js';
import { ExecutionMapper } from './execution.mapper.js';
import type { ExecutionFailureReason } from './runner.errors.js';
import { RUNNER_OPTIONS, type RunnerOptions } from './runner.options.js';

/** An active execution the reaper found past one of its timeouts. */
export interface StaleExecution {
  id: string;
  organizationId: string;
  taskId: string;
  sandboxReference: Record<string, unknown> | null;
  /** Which timeout: the run's (fails with `timeout`) or a lost runner. */
  expired: 'run' | 'provisioning' | 'heartbeat';
}

const TASK_FAILURE: Record<
  Exclude<ExecutionFailureReason, 'interrupted'>,
  TaskFailureReason
> = {
  agent_failed: 'agent_failed',
  timeout: 'timeout',
  infrastructure: 'infrastructure',
  access_denied: 'access_denied',
};

/**
 * Executions (docs/tasks.md, Executions) and what their ends mean for the
 * task: every change to an execution and the task's transition happen in
 * one transaction, with the execution row locked first. Anything that finds
 * its execution already ended (the reaper got there first, or the task was
 * cancelled) changes nothing.
 */
@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);

  constructor(
    @InjectRepository(ExecutionEntity)
    private readonly executions: Repository<ExecutionEntity>,
    private readonly mapper: ExecutionMapper,
    private readonly tasks: TasksService,
    private readonly queue: TaskQueue,
    private readonly gateway: ModelGateway,
    @Inject(RUNNER_OPTIONS) private readonly options: RunnerOptions,
  ) {}

  /**
   * Claims the next task (`TaskQueue`: `provisioning`) and records its new
   * execution, in one transaction; null if nothing can start now.
   */
  @Transactional()
  async claim(
    runnerId: string,
  ): Promise<{ task: TaskResponse; executionId: string } | null> {
    const task = await this.queue.claimNext(this.options.limits);
    if (!task) {
      return null;
    }
    return { task, executionId: await this.start(task, runnerId) };
  }

  private async start(task: TaskResponse, runnerId: string): Promise<string> {
    const previous = await this.executions.count({
      where: { taskId: task.id },
    });
    const entity = this.mapper.toEntity(
      task,
      previous + 1,
      runnerId,
      new Date(),
    );
    await this.executions.save(entity);
    return entity.id;
  }

  /**
   * The sandbox is ready: the execution runs, the task is `running`, and the
   * run timeout starts; returns the deadline. Null if the execution ended
   * meanwhile, or the task was cancelled (the execution is then too).
   */
  @Transactional()
  async markRunning(
    executionId: string,
    sandboxReference: Record<string, unknown> | null,
  ): Promise<Date | null> {
    const execution = await this.lock(executionId);
    if (execution?.status !== 'provisioning') {
      return null;
    }
    const now = new Date();
    execution.status = 'running';
    execution.sandboxReference = sandboxReference;
    execution.heartbeatAt = now;
    execution.deadlineAt = new Date(now.getTime() + this.options.runTimeoutMs);
    await this.executions.save(execution);
    if (!(await this.moveTask(execution, [['run', 'sandbox-ready']]))) {
      await this.end(execution, 'cancelled', {});
      return null;
    }
    return execution.deadlineAt;
  }

  /**
   * The runner is alive and still running it. Returns whether the execution
   * is still active, and the task's status (a cancelled task must stop).
   */
  async heartbeat(
    executionId: string,
  ): Promise<{ active: boolean; taskStatus: TaskStatus | null }> {
    const result = await this.executions.update(
      { id: executionId, status: In([...ACTIVE_EXECUTION]) },
      { heartbeatAt: new Date() },
    );
    const execution = await this.executions.findOne({
      where: { id: executionId },
      select: { id: true, organizationId: true, taskId: true },
    });
    return {
      active: (result.affected ?? 0) > 0,
      taskStatus: execution
        ? await this.tasks.statusOf(execution.organizationId, execution.taskId)
        : null,
    };
  }

  /**
   * The agent finished. Until verification and artifacts exist, the task
   * goes straight through `verifying` and `delivering` to `succeeded`.
   */
  @Transactional()
  async complete(executionId: string, summary: string): Promise<void> {
    const execution = await this.lock(executionId);
    if (execution?.status !== 'running') {
      return;
    }
    await this.end(execution, 'completed', { summary });
    await this.moveTask(execution, [
      ['verify', 'agent-finished'],
      ['deliver', 'nothing-to-verify'],
      ['succeed', 'nothing-to-deliver'],
    ]);
  }

  /**
   * The execution failed. A retryable infrastructure failure requeues the
   * task with backoff while the attempt has failures left (docs/tasks.md,
   * Retries); `interrupted` always requeues and doesn't count; anything else
   * fails the task with the matching reason.
   */
  @Transactional()
  async fail(
    executionId: string,
    reason: ExecutionFailureReason,
    error: string,
    retryable = reason === 'infrastructure',
  ): Promise<void> {
    const execution = await this.lock(executionId);
    if (!execution || !ACTIVE_EXECUTION.includes(execution.status)) {
      return;
    }
    await this.end(execution, 'failed', { failureReason: reason, error });

    if (reason === 'interrupted') {
      await this.moveTask(execution, [['requeue', 'interrupted']]);
      return;
    }
    if (reason === 'infrastructure' && retryable) {
      const failures = await this.executions.count({
        where: {
          taskId: execution.taskId,
          attempt: execution.attempt,
          failureReason: 'infrastructure',
        },
      });
      if (failures < this.options.maxInfrastructureFailures) {
        const delay = this.options.retryBackoffMs * 2 ** (failures - 1);
        await this.moveTask(execution, [['requeue', 'infrastructure-retry']], {
          notBefore: new Date(Date.now() + delay),
        });
        return;
      }
    }
    await this.moveTask(execution, [['fail', reason]], {
      failureReason: TASK_FAILURE[reason],
    });
  }

  /** The task was cancelled; the execution stopped (or was abandoned). */
  @Transactional()
  async cancelled(executionId: string): Promise<void> {
    const execution = await this.lock(executionId);
    if (execution && ACTIVE_EXECUTION.includes(execution.status)) {
      await this.end(execution, 'cancelled', {});
    }
  }

  /** Active executions past a timeout, for the reaper. */
  async stale(now = new Date()): Promise<StaleExecution[]> {
    const ago = (ms: number) => new Date(now.getTime() - ms);
    const found = await this.executions.find({
      where: [
        {
          status: In([...ACTIVE_EXECUTION]),
          heartbeatAt: LessThan(ago(this.options.heartbeatTimeoutMs)),
        },
        {
          status: 'provisioning',
          startedAt: LessThan(ago(this.options.provisioningTimeoutMs)),
        },
        // The runner aborts at the deadline; this catches one that didn't.
        {
          status: 'running',
          deadlineAt: LessThan(ago(this.options.stopGraceMs)),
        },
      ],
      take: 100,
    });
    return found.map((execution) => ({
      id: execution.id,
      organizationId: execution.organizationId,
      taskId: execution.taskId,
      sandboxReference: execution.sandboxReference,
      expired:
        execution.heartbeatAt < ago(this.options.heartbeatTimeoutMs)
          ? 'heartbeat'
          : execution.status === 'provisioning'
            ? 'provisioning'
            : 'run',
    }));
  }

  /** The sandbox is gone; forget its reference. */
  async sandboxDestroyed(executionId: string): Promise<void> {
    await this.executions.update(
      { id: executionId },
      { sandboxReference: null },
    );
  }

  async list(
    organizationId: string,
    projectId: string,
    taskId: string,
    page: ListExecutionsQuery,
  ): Promise<Page<ExecutionResponse>> {
    // 404 for another organization's or project's task.
    await this.tasks.findById(organizationId, projectId, taskId);
    const entities = await findPage(
      this.executions,
      { where: { taskId }, sortBy: 'startedAt', direction: 'DESC' },
      page,
    );
    const usage = await this.gateway.usageOf(
      entities.items.map((entity) => entity.id),
    );
    return mapPage(entities, (entity) =>
      this.mapper.toResponse(entity, usage.get(entity.id)),
    );
  }

  private lock(executionId: string): Promise<ExecutionEntity | null> {
    return this.executions.findOne({
      where: { id: executionId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async end(
    execution: ExecutionEntity,
    status: ExecutionStatus,
    fields: Partial<
      Pick<ExecutionEntity, 'summary' | 'failureReason' | 'error'>
    >,
  ): Promise<void> {
    Object.assign(execution, fields, { status, endedAt: new Date() });
    await this.executions.save(execution);
  }

  /**
   * Moves the task on; false if it can't (it was cancelled meanwhile): the
   * execution stands as it is and so does the task.
   */
  private async moveTask(
    execution: ExecutionEntity,
    steps: [Parameters<TasksService['transition']>[2], string][],
    options: { notBefore?: Date; failureReason?: TaskFailureReason } = {},
  ): Promise<boolean> {
    try {
      for (const [action, reason] of steps) {
        await this.tasks.transition(
          execution.organizationId,
          execution.taskId,
          action,
          options.failureReason ?? null,
          { notBefore: options.notBefore, reason },
        );
      }
      return true;
    } catch (error) {
      if (!(error instanceof InvalidTaskTransitionError)) {
        throw error;
      }
      this.logger.log(
        `Task ${execution.taskId} moved on without execution ${execution.id}: ${error.message}`,
      );
      return false;
    }
  }
}
