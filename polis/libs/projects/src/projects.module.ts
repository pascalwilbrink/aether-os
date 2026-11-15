import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '@polis/organizations';

import { ProjectEntity } from './project.entity.js';
import { ProjectMapper } from './project.mapper.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectEntity]), OrganizationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMapper],
  exports: [ProjectsService],
})
export class ProjectsModule {}
