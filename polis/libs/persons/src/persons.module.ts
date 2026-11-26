import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DepartmentsModule } from '@polis/departments';
import { OrganizationsModule } from '@polis/organizations';
import { UsersModule } from '@polis/users';

import { PersonDepartmentEntity } from './person-department.entity.js';
import { PersonDepartmentsService } from './person-departments.service.js';
import { PersonEntity } from './person.entity.js';
import { PersonMapper } from './person.mapper.js';
import { PersonsAnnounceController } from './persons-announce.controller.js';
import { PersonsController } from './persons.controller.js';
import { PersonsService } from './persons.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([PersonEntity, PersonDepartmentEntity]),
    OrganizationsModule,
    DepartmentsModule,
    UsersModule,
  ],
  controllers: [PersonsController, PersonsAnnounceController],
  providers: [PersonsService, PersonMapper, PersonDepartmentsService],
  exports: [PersonsService],
})
export class PersonsModule {}
