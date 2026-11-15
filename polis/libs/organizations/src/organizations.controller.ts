import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { ZodSerializerDto } from '@polis/core';

import { CreateOrganizationRequest } from './dto/create-organization.request.js';
import { ListOrganizationsQuery } from './dto/list-organizations.query.js';
import { OrganizationBySlugParams } from './dto/organization-by-slug.params.js';
import { OrganizationPage } from './dto/organization-page.response.js';
import { OrganizationParams } from './dto/organization.params.js';
import { OrganizationResponse } from './dto/organization.response.js';
import { OrganizationsService } from './organizations.service.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Post()
  @ZodSerializerDto(OrganizationResponse)
  create(@Body() body: CreateOrganizationRequest) {
    return this.organizations.create(body);
  }

  @Get()
  @ZodSerializerDto(OrganizationPage)
  list(@Query() query: ListOrganizationsQuery) {
    return this.organizations.list(query);
  }

  @Get('by-slug/:slug')
  @ZodSerializerDto(OrganizationResponse)
  findBySlug(@Param() { slug }: OrganizationBySlugParams) {
    return this.organizations.findBySlug(slug);
  }

  @Get(':organizationId')
  @ZodSerializerDto(OrganizationResponse)
  findById(@Param() { organizationId }: OrganizationParams) {
    return this.organizations.findById(organizationId);
  }

  @Post(':organizationId/suspend')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OrganizationResponse)
  suspend(@Param() { organizationId }: OrganizationParams) {
    return this.organizations.suspend(organizationId);
  }

  @Post(':organizationId/activate')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(OrganizationResponse)
  activate(@Param() { organizationId }: OrganizationParams) {
    return this.organizations.activate(organizationId);
  }
}
