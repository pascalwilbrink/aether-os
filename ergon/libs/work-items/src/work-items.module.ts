import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssigneesModule } from '@ergon/assignees';
import { TenancyModule } from '@ergon/tenancy';

import {
  WorkActivityEntity,
  WorkAssignmentEntity,
  WorkDependencyEntity,
  WorkItemEntity,
} from './entities/index.js';
import { AssigneeEventsListener } from './assignee-events.listener.js';
import { WorkAccess } from './work-access.service.js';
import { WorkActivityService } from './work-activity.service.js';
import { WorkAssignmentsController } from './work-assignments.controller.js';
import { WorkAssignmentsService } from './work-assignments.service.js';
import { WorkDependenciesController } from './work-dependencies.controller.js';
import { WorkDependenciesService } from './work-dependencies.service.js';
import { WorkItemMapper } from './work-item.mapper.js';
import { WorkItemStore } from './work-item.store.js';
import { WorkItemsController } from './work-items.controller.js';
import { WorkItemsService } from './work-items.service.js';

/** Work items, their assignments, dependencies and activity (ergon/CLAUDE.md). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkItemEntity,
      WorkAssignmentEntity,
      WorkDependencyEntity,
      WorkActivityEntity,
    ]),
    TenancyModule,
    AssigneesModule,
  ],
  controllers: [
    WorkItemsController,
    WorkAssignmentsController,
    WorkDependenciesController,
  ],
  providers: [
    AssigneeEventsListener,
    WorkAccess,
    WorkActivityService,
    WorkAssignmentsService,
    WorkDependenciesService,
    WorkItemMapper,
    WorkItemStore,
    WorkItemsService,
  ],
  exports: [WorkItemsService, WorkAssignmentsService, WorkDependenciesService],
})
export class WorkItemsModule {}
