import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MembershipsModule } from '@polis/memberships';
import { OrganizationsModule } from '@polis/organizations';

import { DepartmentMemberEntity } from './department-member.entity.js';
import { DepartmentMemberMapper } from './department-member.mapper.js';
import { DepartmentEntity } from './department.entity.js';
import { DepartmentMapper } from './department.mapper.js';
import { DepartmentMembersService } from './department-members.service.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([DepartmentEntity, DepartmentMemberEntity]),
    OrganizationsModule,
    MembershipsModule,
  ],
  controllers: [DepartmentsController],
  providers: [
    DepartmentsService,
    DepartmentMapper,
    DepartmentMembersService,
    DepartmentMemberMapper,
  ],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
