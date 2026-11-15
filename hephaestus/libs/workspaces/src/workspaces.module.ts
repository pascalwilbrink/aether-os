import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '@hephaestus/organizations';
import { ProjectsModule } from '@hephaestus/projects';

import { WorkspaceEntity } from './workspace.entity.js';
import { WorkspaceMapper } from './workspace.mapper.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceEntity]),
    OrganizationsModule,
    ProjectsModule,
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMapper],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
