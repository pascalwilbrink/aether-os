import { HttpException, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import {
  DomainError,
  HephaestusEvents,
  OnDomainEvent,
  Propagation,
  runAsPrincipal,
  Transactional,
  ValidationProblemException,
  zCreateTaskFromTemplateRequest,
  zCreateTaskRequest,
  type DomainEvent,
  type HephaestusEventTypes,
  type Principal,
} from '@hephaestus/core';
import { TaskBudgetsService, type TaskResponse } from '@hephaestus/tasks';

import { TemplatedTasksService } from './templated-tasks.service.js';

type TaskCreate = HephaestusEventTypes.TaskCreate;

/** The command's payload, checked against the HTTP API's own schemas. */
const zTaskCreate = z.union([
  z.strictObject({
    automationId: z.uuid().nullish(),
    task: zCreateTaskRequest.strict(),
  }),
  z.strictObject({
    automationId: z.uuid().nullish(),
    template: zCreateTaskFromTemplateRequest
      .extend({ templateId: z.uuid() })
      .strict(),
  }),
]);

/** Why a command can't become a task: answered, never retried. */
class Rejection extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The `task.create` command (docs/events.md, Commands): how platform
 * services such as Kairos start tasks, through RabbitMQ so a trigger
 * survives Hephaestus being down. It goes through the same services as the
 * HTTP API (`POST …/tasks`, `POST …/task-templates/{id}/tasks`), with the
 * command's `eventId` as the idempotency key, so it validates the same way
 * and a resent command returns the task it created. The answer is an event:
 * `task.created` (published again for a resent command), or
 * `task.create-rejected` for a command that can never succeed. Failures
 * that may pass (Polis unreachable, the database) throw, so Krepis's
 * consumer retries the message.
 */
@Injectable()
export class TaskCommands {
  private readonly logger = new Logger(TaskCommands.name);

  constructor(
    private readonly tasks: TaskBudgetsService,
    private readonly templated: TemplatedTasksService,
    private readonly events: HephaestusEvents,
  ) {}

  @OnDomainEvent('commands.task.create')
  async onCreate(command: DomainEvent<TaskCreate>): Promise<void> {
    const organizationId = command.organizationId;
    if (!organizationId) {
      // No tenant to answer in: an event needs one (docs/events.md).
      this.logger.warn(
        `task.create ${command.eventId} without an organization; dropped`,
      );
      return;
    }
    const automationId = command.payload.automationId ?? null;
    try {
      const { task, created } = await this.create(command);
      if (!created) {
        // A resent command: answer again, for a sender that missed it.
        await this.announce(command, task);
      }
    } catch (error) {
      const rejection = rejectionOf(error);
      if (!rejection) {
        throw error;
      }
      this.logger.warn(
        `task.create ${command.eventId} rejected: ${rejection.code}`,
      );
      await this.events.emit({
        eventType: 'task.create-rejected',
        aggregateId: command.eventId,
        aggregateVersion: 1,
        organizationId,
        projectId: command.projectId ?? undefined,
        payload: {
          idempotencyKey: command.eventId,
          automationId,
          code: rejection.code,
          message: rejection.message,
        },
      });
    }
  }

  /**
   * Creates the task as the sending service, in a savepoint: a command
   * rejected halfway leaves nothing behind, while the rejection is
   * recorded in the inbox's transaction.
   */
  @Transactional({ propagation: Propagation.NESTED })
  private async create(
    command: DomainEvent<TaskCreate>,
  ): Promise<{ task: TaskResponse; created: boolean }> {
    const { organizationId, projectId, actor } = command;
    if (!organizationId || !projectId) {
      throw new Rejection(
        'VALIDATION_FAILED',
        'A task.create command needs a projectId.',
      );
    }
    // Only platform services send commands (the broker is the trust
    // boundary; this keeps a leaked user event from becoming a task).
    if (actor?.sub_type !== 'service') {
      throw new Rejection(
        'FORBIDDEN',
        'Only platform services send task.create commands.',
      );
    }
    const parsed = zTaskCreate.safeParse(command.payload);
    if (!parsed.success) {
      throw new Rejection(
        'VALIDATION_FAILED',
        parsed.error.issues
          .map(
            (issue) =>
              `${issue.path.join('.') || '(payload)'}: ${issue.message}`,
          )
          .join('; '),
      );
    }
    const principal: Principal = {
      sub: actor.sub,
      subType: 'service',
      organizationId,
      organizationRoles: [],
      projectRoles: {},
      projectId: null,
      taskId: null,
      taskTreeId: null,
      agentId: null,
      agentVersionId: null,
      actor: null,
      // Reads what a task needs (its template, its project); creating it is
      // the command itself.
      scopes: ['platform:read'],
    };
    const payload = parsed.data;
    return runAsPrincipal(principal, () => {
      if ('task' in payload) {
        return this.tasks.create(
          organizationId,
          projectId,
          payload.task,
          command.eventId,
        );
      }
      const { templateId, ...request } = payload.template;
      return this.templated.create(
        organizationId,
        projectId,
        templateId,
        request,
        command.eventId,
      );
    });
  }

  private async announce(
    command: DomainEvent<TaskCreate>,
    task: TaskResponse,
  ): Promise<void> {
    await this.events.emit({
      eventType: 'task.created',
      aggregateId: task.id,
      aggregateVersion: task.version,
      organizationId: task.organizationId,
      projectId: task.projectId,
      payload: {
        taskId: task.id,
        parentTaskId: task.parentTaskId,
        topLevelTaskId: task.topLevelTaskId,
        agentId: task.agentId,
        agentVersionId: task.agentVersionId,
        serviceAccountId: task.serviceAccountId,
        requestedBy: task.requestedBy,
        idempotencyKey: command.eventId,
        status: task.status,
        taskTemplateId: task.taskTemplateId,
        taskTemplateVersion: task.taskTemplateVersion,
      },
    });
  }
}

/** A command that can never succeed, with the code the HTTP API would give; null to retry. */
function rejectionOf(error: unknown): Rejection | null {
  if (error instanceof Rejection) {
    return error;
  }
  if (error instanceof DomainError) {
    return new Rejection(error.code, error.message);
  }
  if (error instanceof ValidationProblemException) {
    return new Rejection(
      'VALIDATION_FAILED',
      error.errors.map((problem) => problem.detail).join('; '),
    );
  }
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const code =
      status === 403
        ? 'FORBIDDEN'
        : status === 404
          ? 'NOT_FOUND'
          : status === 409
            ? 'CONFLICT'
            : status >= 400 && status < 500 && status !== 429
              ? 'VALIDATION_FAILED'
              : null;
    return code ? new Rejection(code, error.message) : null;
  }
  return null;
}
