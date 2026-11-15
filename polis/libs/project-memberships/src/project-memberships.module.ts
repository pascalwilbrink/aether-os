import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MembershipsModule } from '@polis/memberships';
import { ProjectsModule } from '@polis/projects';

import { ProjectMembershipEntity } from './project-membership.entity.js';
import { ProjectMembershipMapper } from './project-membership.mapper.js';
import {
  ProjectMembershipsController,
  SubjectProjectMembershipsController,
} from './project-memberships.controller.js';
import { ProjectMembershipsService } from './project-memberships.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectMembershipEntity]),
    ProjectsModule,
    MembershipsModule,
  ],
  controllers: [
    ProjectMembershipsController,
    SubjectProjectMembershipsController,
  ],
  providers: [ProjectMembershipsService, ProjectMembershipMapper],
  exports: [ProjectMembershipsService],
})
export class ProjectMembershipsModule {}
