import { Controller, Get, Param, Query } from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@pistis/core';

import {
  ListOrganizationUsersQuery,
  OrganizationUserPage,
  OrganizationUsersParams,
} from './dto/organization-users.dto.js';
import { OrganizationUsersService } from './organization-users.service.js';

@Controller('organizations/:organizationId/users')
export class OrganizationUsersController {
  constructor(private readonly people: OrganizationUsersService) {}

  @Get()
  @RequirePermission('member:read')
  @ZodSerializerDto(OrganizationUserPage)
  list(
    @Param() { organizationId }: OrganizationUsersParams,
    @Query() query: ListOrganizationUsersQuery,
  ) {
    return this.people.list(organizationId, query);
  }
}
