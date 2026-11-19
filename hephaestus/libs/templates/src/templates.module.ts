import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@hephaestus/agents';
import { TasksModule } from '@hephaestus/tasks';
import { TenancyModule } from '@hephaestus/tenancy';

import { TaskTemplateVersionEntity } from './task-template-version.entity.js';
import { TaskTemplateEntity } from './task-template.entity.js';
import { TaskTemplateMapper } from './task-template.mapper.js';
import { TaskTemplatesController } from './task-templates.controller.js';
import { TaskTemplatesService } from './task-templates.service.js';
import { TemplatedTasksController } from './templated-tasks.controller.js';
import { TaskCommands } from './task-commands.js';
import { TemplatedTasksService } from './templated-tasks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([TaskTemplateEntity, TaskTemplateVersionEntity]),
    AgentsModule,
    TasksModule,
    TenancyModule,
  ],
  controllers: [TaskTemplatesController, TemplatedTasksController],
  providers: [
    TaskTemplatesService,
    TemplatedTasksService,
    TaskTemplateMapper,
    TaskCommands,
  ],
  exports: [TaskTemplatesService, TemplatedTasksService],
})
export class TemplatesModule {}
