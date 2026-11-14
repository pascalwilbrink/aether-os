import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionModule } from '@polis/core';
import { OrganizationsModule } from '@polis/organizations';

import { ProjectService } from './application/service/project.service.js';
import { ProjectRepository } from './domain/repository/project.repository.js';
import { ProjectEntity } from './infrastructure/persistence/entity/project.entity.js';
import { ProjectMapper } from './infrastructure/persistence/mapper/project.mapper.js';
import { TypeOrmProjectRepository } from './infrastructure/persistence/repository/typeorm-project.repository.js';
import { ProjectsController } from './presentation/http/projects.controller.js';

@Module({
  imports: [
    // Registers the entity with autoLoadEntities; the repository resolves
    // it through TypeOrmTransactionManager.
    TypeOrmModule.forFeature([ProjectEntity]),
    TransactionModule,
    OrganizationsModule,
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectService,
    ProjectMapper,
    { provide: ProjectRepository, useClass: TypeOrmProjectRepository },
  ],
  exports: [ProjectService],
})
export class ProjectsModule {}
