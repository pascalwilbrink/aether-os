import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionModule } from '@hephaestus/core';
import { OrganizationsModule } from '@hephaestus/organizations';
import { ProjectsModule } from '@hephaestus/projects';

import { WorkspaceService } from './application/service/workspace.service.js';
import { WorkspaceRepository } from './domain/repository/workspace.repository.js';
import { WorkspaceEntity } from './infrastructure/persistence/entity/workspace.entity.js';
import { WorkspaceMapper } from './infrastructure/persistence/mapper/workspace.mapper.js';
import { TypeOrmWorkspaceRepository } from './infrastructure/persistence/repository/typeorm-workspace.repository.js';
import { WorkspacesController } from './presentation/http/workspaces.controller.js';

@Module({
  imports: [
    // Registers the entity with autoLoadEntities; the repository resolves
    // it through TypeOrmTransactionManager.
    TypeOrmModule.forFeature([WorkspaceEntity]),
    TransactionModule,
    OrganizationsModule,
    ProjectsModule,
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspaceService,
    WorkspaceMapper,
    { provide: WorkspaceRepository, useClass: TypeOrmWorkspaceRepository },
  ],
  exports: [WorkspaceService],
})
export class WorkspacesModule {}
