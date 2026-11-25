import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import {
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@polis/core';

import { CreateDepartmentRequest } from './dto/create-department.request.js';
import { DepartmentPage } from './dto/department-page.response.js';
import { DepartmentParams } from './dto/department.params.js';
import { DepartmentResponse } from './dto/department.response.js';
import { DepartmentsParams } from './dto/departments.params.js';
import { ListDepartmentsQuery } from './dto/list-departments.query.js';
import { UpdateDepartmentRequest } from './dto/update-department.request.js';
import { DepartmentsService } from './departments.service.js';

@Controller('organizations/:organizationId/departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @Post()
  @RequirePermission('org:manage')
  @ZodSerializerDto(DepartmentResponse)
  create(
    @Param() { organizationId }: DepartmentsParams,
    @Body() body: CreateDepartmentRequest,
  ) {
    return this.departments.create(organizationId, body);
  }

  @Get()
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(DepartmentPage)
  list(
    @Param() { organizationId }: DepartmentsParams,
    @Query() query: ListDepartmentsQuery,
  ) {
    return this.departments.list(organizationId, query);
  }

  @Get(':departmentId')
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(DepartmentResponse)
  findById(@Param() { organizationId, departmentId }: DepartmentParams) {
    return this.departments.findById(organizationId, departmentId);
  }

  @Put(':departmentId')
  @RequirePermission('org:manage')
  @ZodSerializerDto(DepartmentResponse)
  update(
    @Param() { organizationId, departmentId }: DepartmentParams,
    @Body() body: UpdateDepartmentRequest,
  ) {
    return this.departments.update(organizationId, departmentId, body);
  }

  @Post(':departmentId/archive')
  @RequirePermission('org:manage')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(DepartmentResponse)
  archive(@Param() { organizationId, departmentId }: DepartmentParams) {
    return this.departments.archive(organizationId, departmentId);
  }
}
