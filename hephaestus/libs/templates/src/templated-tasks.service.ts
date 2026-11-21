import { Injectable } from '@nestjs/common';

import { Transactional, type ApiTypes } from '@hephaestus/core';
import {
  TaskContextSource,
  TasksService,
  type TaskResponse,
} from '@hephaestus/tasks';

import {
  render,
  TemplateProblem,
  type RenderedTemplate,
} from './template-content.js';
import { TaskTemplateInputsInvalidError } from './task-template.errors.js';
import { TaskTemplatesService } from './task-templates.service.js';

/**
 * Tasks from templates (docs/tasks.md, Task templates): a template version
 * (its latest unless one is given) with the inputs filled in becomes the
 * task's title, description, requirements, expected outcome,
 * constraints and deliverables, its agent the task's agent, and its
 * acceptance criteria and review kinds the task's, plus any the request
 * adds; it can't remove any. The version is pinned on the task.
 */
@Injectable()
export class TemplatedTasksService {
  constructor(
    private readonly templates: TaskTemplatesService,
    private readonly tasks: TasksService,
    private readonly contextSource: TaskContextSource,
  ) {}

  @Transactional()
  async create(
    organizationId: string,
    projectId: string,
    templateId: string,
    request: ApiTypes.CreateTaskFromTemplateRequest,
    idempotencyKey: string,
  ): Promise<{ task: TaskResponse; created: boolean }> {
    const resolved = await this.templates.resolve(
      organizationId,
      projectId,
      templateId,
      request.version,
    );
    const { effective } = resolved;
    let rendered: RenderedTemplate;
    try {
      rendered = render(effective, request.inputs ?? {});
    } catch (error) {
      if (error instanceof TemplateProblem) {
        throw new TaskTemplateInputsInvalidError(error.message);
      }
      throw error;
    }
    // The template's knowledge and the request's, pinned now (docs/tasks.md,
    // `context`), unless this idempotency key already made the task.
    const itemIds = [...effective.context, ...(request.context ?? [])].map(
      (entry) => entry.itemId,
    );
    const pinned =
      itemIds.length > 0 &&
      !(await this.tasks.findByIdempotencyKey(organizationId, idempotencyKey))
        ? await this.contextSource.pin(organizationId, projectId, itemIds)
        : [];
    return this.tasks.create(
      organizationId,
      projectId,
      {
        ...rendered,
        // The request adds to the template's brief, never replacing it.
        requirements: [
          ...(rendered.requirements ?? []),
          ...(request.requirements ?? []),
        ],
        constraints: [
          ...(rendered.constraints ?? []),
          ...(request.constraints ?? []),
        ],
        deliverables: [
          ...(rendered.deliverables ?? []),
          ...(request.deliverables ?? []),
        ],
        untrustedInputs: request.untrustedInputs,
        agentId: effective.agentId,
        serviceAccountId: request.serviceAccountId,
        parentTaskId: request.parentTaskId,
        dependsOn: request.dependsOn,
        acceptanceCriteria: request.acceptanceCriteria,
        repository: request.repository,
        concurrency: request.concurrency,
        review: {
          artifactKinds: [
            ...new Set([
              ...effective.review.artifactKinds,
              ...(request.review?.artifactKinds ?? []),
            ]),
          ],
        },
      },
      idempotencyKey,
      {
        templateId: resolved.templateId,
        version: resolved.version,
        acceptanceCriteria: effective.acceptanceCriteria,
      },
      pinned,
    );
  }
}
