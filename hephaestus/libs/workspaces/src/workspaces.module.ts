import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenancyModule } from '@hephaestus/tenancy';

import { WorkspaceEntity } from './workspace.entity.js';
import { WorkspaceMapper } from './workspace.mapper.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([WorkspaceEntity]), TenancyModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMapper],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
