import {
  Body,
  Controller,
  Headers,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  RequirePermission,
  ValidationProblemException,
  ZodSerializerDto,
} from '@hephaestus/core';

import { CreateTaskFromTemplateRequest } from './dto/create-task-from-template.request.js';
import { TaskResponseDto } from './dto/task.response.js';
import { TemplatedTaskParams } from './dto/templated-task.params.js';
import { TemplatedTasksService } from './templated-tasks.service.js';

@Controller(
  'organizations/:organizationId/projects/:projectId/task-templates/:templateId/tasks',
)
export class TemplatedTasksController {
  constructor(private readonly templatedTasks: TemplatedTasksService) {}

  /** As creating a task: 201 for a new one, 200 for the key's earlier one. */
  @Post()
  @RequirePermission('task:create', { project: 'projectId' })
  @ZodSerializerDto(TaskResponseDto)
  async create(
    @Param() { organizationId, projectId, templateId }: TemplatedTaskParams,
    @Body() body: CreateTaskFromTemplateRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new ValidationProblemException([
        {
          pointer: null,
          parameter: 'Idempotency-Key',
          code: idempotencyKey ? 'INVALID' : 'REQUIRED',
          detail:
            'An Idempotency-Key header of 1 to 200 characters is required.',
        },
      ]);
    }
    const { task, created } = await this.templatedTasks.create(
      organizationId,
      projectId,
      templateId,
      body,
      idempotencyKey,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return task;
  }
}
