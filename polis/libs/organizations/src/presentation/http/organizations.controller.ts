import { randomUUID } from 'node:crypto';

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

import {
  PageResponse,
  PaginationQuery,
  type OrganizationId,
} from '@polis/core';

import { OrganizationService } from '../../application/service/organization.service.js';
import { CreateOrganizationRequest } from './dto/create-organization.request.js';
import { OrganizationResponse } from './dto/organization.response.js';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  async create(
    @Body() body: CreateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    const organization = await this.organizationService.create({
      id: randomUUID() as OrganizationId,
      name: body.name,
      slug: body.slug,
      createdBy: body.createdBy,
    });

    return OrganizationResponse.fromDomain(organization);
  }

  @Get()
  async list(
    @Query() query: PaginationQuery,
  ): Promise<PageResponse<OrganizationResponse>> {
    const page = await this.organizationService.list(query);

    return PageResponse.fromPage(page, (organization) =>
      OrganizationResponse.fromDomain(organization),
    );
  }

  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<OrganizationResponse> {
    const organization = await this.organizationService.findBySlug(slug);

    return OrganizationResponse.fromDomain(organization);
  }

  @Get(':organizationId')
  async findById(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponse> {
    const organization = await this.organizationService.findById(
      organizationId as OrganizationId,
    );

    return OrganizationResponse.fromDomain(organization);
  }

  @Post(':organizationId/suspend')
  @HttpCode(HttpStatus.OK)
  async suspend(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponse> {
    const organization = await this.organizationService.suspend(
      organizationId as OrganizationId,
    );

    return OrganizationResponse.fromDomain(organization);
  }

  @Post(':organizationId/activate')
  @HttpCode(HttpStatus.OK)
  async activate(
    @Param('organizationId') organizationId: string,
  ): Promise<OrganizationResponse> {
    const organization = await this.organizationService.activate(
      organizationId as OrganizationId,
    );

    return OrganizationResponse.fromDomain(organization);
  }
}
