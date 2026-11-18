import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@hephaestus/agents';
import { ModelsModule } from '@hephaestus/models';
import { TenancyModule } from '@hephaestus/tenancy';

import { TaskEntity } from './task.entity.js';
import { TaskMapper } from './task.mapper.js';
import { TasksController } from './tasks.controller.js';
import { TaskBudgetsService } from './task-budgets.service.js';
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
  providers: [TasksService, TaskMapper, TaskQueue, TaskBudgetsService],
  exports: [TasksService, TaskQueue],
})
export class TasksModule {}
