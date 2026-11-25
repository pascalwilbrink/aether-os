import {
  Body,
  Controller,
  Delete,
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

import { ListPersonsQuery } from './dto/list-persons.query.js';
import { PersonPage } from './dto/person-page.response.js';
import { PersonParams } from './dto/person.params.js';
import { PersonRequest } from './dto/person.request.js';
import { PersonResponse } from './dto/person.response.js';
import { PersonsParams } from './dto/persons.params.js';
import { PersonsService } from './persons.service.js';

@Controller('organizations/:organizationId/persons')
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  @Post()
  @RequirePermission('member:manage')
  @ZodSerializerDto(PersonResponse)
  create(
    @Param() { organizationId }: PersonsParams,
    @Body() body: PersonRequest,
  ) {
    return this.persons.create(organizationId, body);
  }

  @Get()
  @RequirePermission('member:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(PersonPage)
  list(
    @Param() { organizationId }: PersonsParams,
    @Query() query: ListPersonsQuery,
  ) {
    return this.persons.list(organizationId, query);
  }

  @Get(':personId')
  @RequirePermission('member:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(PersonResponse)
  findById(@Param() { organizationId, personId }: PersonParams) {
    return this.persons.findById(organizationId, personId);
  }

  @Put(':personId')
  @RequirePermission('member:manage')
  @ZodSerializerDto(PersonResponse)
  update(
    @Param() { organizationId, personId }: PersonParams,
    @Body() body: PersonRequest,
  ) {
    return this.persons.update(organizationId, personId, body);
  }

  @Delete(':personId')
  @RequirePermission('member:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param() { organizationId, personId }: PersonParams) {
    return this.persons.delete(organizationId, personId);
  }
}
