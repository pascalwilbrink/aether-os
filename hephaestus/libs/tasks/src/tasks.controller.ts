import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import {
  RequirePermission,
  ValidationProblemException,
  ZodSerializerDto,
} from '@hephaestus/core';

import { CreateTaskRequest } from './dto/create-task.request.js';
import { ListTasksQuery } from './dto/list-tasks.query.js';
import { TaskPage } from './dto/task-page.response.js';
import { TaskParams } from './dto/task.params.js';
import { TaskResponse } from './dto/task.response.js';
import { TasksParams } from './dto/tasks.params.js';
import { TasksService } from './tasks.service.js';

const IN_PROJECT = { project: 'projectId' };

@Controller('organizations/:organizationId/projects/:projectId/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** 201 for a new task, 200 for the one this `Idempotency-Key` created before. */
  @Post()
  @RequirePermission('task:create', IN_PROJECT)
  @ZodSerializerDto(TaskResponse)
  async create(
    @Param() { organizationId, projectId }: TasksParams,
    @Body() body: CreateTaskRequest,
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
    const { task, created } = await this.tasks.create(
      organizationId,
      projectId,
      body,
      idempotencyKey,
    );
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return task;
  }

  @Get()
  @RequirePermission('task:read', IN_PROJECT)
  @ZodSerializerDto(TaskPage)
  list(
    @Param() { organizationId, projectId }: TasksParams,
    @Query() query: ListTasksQuery,
  ) {
    return this.tasks.list(organizationId, projectId, query);
  }

  @Get(':taskId')
  @RequirePermission('task:read', IN_PROJECT)
  @ZodSerializerDto(TaskResponse)
  findById(@Param() { organizationId, projectId, taskId }: TaskParams) {
    return this.tasks.findById(organizationId, projectId, taskId);
  }

  @Post(':taskId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:cancel', IN_PROJECT)
  @ZodSerializerDto(TaskResponse)
  cancel(@Param() { organizationId, projectId, taskId }: TaskParams) {
    return this.tasks.cancel(organizationId, projectId, taskId);
  }

  @Post(':taskId/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('task:create', IN_PROJECT)
  @ZodSerializerDto(TaskResponse)
  retry(@Param() { organizationId, projectId, taskId }: TaskParams) {
    return this.tasks.retry(organizationId, projectId, taskId);
  }
}
