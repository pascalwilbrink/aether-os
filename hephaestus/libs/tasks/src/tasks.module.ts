import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@hephaestus/agents';
import { ServiceTokens, type Env } from '@hephaestus/core';
import { ModelsModule } from '@hephaestus/models';
import { TenancyModule } from '@hephaestus/tenancy';

import { TaskEntity } from './task.entity.js';
import { TaskMapper } from './task.mapper.js';
import { TasksController } from './tasks.controller.js';
import { TaskBudgetsService } from './task-budgets.service.js';
import {
  NoTaskContextSource,
  SeshatTaskContextSource,
  TaskContextSource,
} from './task-context.js';
import { TaskQueue } from './task-queue.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskEntity]),
    TenancyModule,
    AgentsModule,
    ModelsModule,
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    TaskMapper,
    TaskQueue,
    TaskBudgetsService,
    {
      // Pinning knowledge on tasks needs Seshat (docs/tasks.md, `context`).
      provide: TaskContextSource,
      inject: [ConfigService, ServiceTokens],
      useFactory: (config: ConfigService<Env, true>, tokens: ServiceTokens) => {
        const url = config.get('SESHAT_URL', { infer: true });
        return url
          ? new SeshatTaskContextSource(url, tokens)
          : new NoTaskContextSource();
      },
    },
  ],
  exports: [TaskBudgetsService, TasksService, TaskQueue],
})
export class TasksModule {}
