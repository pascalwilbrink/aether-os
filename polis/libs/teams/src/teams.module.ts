import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DepartmentsModule } from '@polis/departments';
import { OrganizationsModule } from '@polis/organizations';
import { PersonsModule } from '@polis/persons';

import { TeamDepartmentEntity } from './team-department.entity.js';
import { TeamDepartmentsService } from './team-departments.service.js';
import { TeamMemberEntity } from './team-member.entity.js';
import { TeamMembersService } from './team-members.service.js';
import { TeamEntity } from './team.entity.js';
import { TeamMapper } from './team.mapper.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TeamEntity,
      TeamDepartmentEntity,
      TeamMemberEntity,
    ]),
    OrganizationsModule,
    DepartmentsModule,
    PersonsModule,
  ],
  controllers: [TeamsController],
  providers: [
    TeamsService,
    TeamMapper,
    TeamDepartmentsService,
    TeamMembersService,
  ],
  exports: [TeamsService],
})
export class TeamsModule {}
