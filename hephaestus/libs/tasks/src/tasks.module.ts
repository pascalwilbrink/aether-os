import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@hephaestus/agents';
import { TenancyModule } from '@hephaestus/tenancy';

import { TaskEntity } from './task.entity.js';
import { TaskMapper } from './task.mapper.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskEntity]),
    TenancyModule,
    AgentsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService, TaskMapper],
  exports: [TasksService],
})
export class TasksModule {}
