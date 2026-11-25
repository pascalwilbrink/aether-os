import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '@polis/organizations';

import { DepartmentEntity } from './department.entity.js';
import { DepartmentMapper } from './department.mapper.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DepartmentEntity]), OrganizationsModule],
  controllers: [DepartmentsController],
  providers: [DepartmentsService, DepartmentMapper],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
