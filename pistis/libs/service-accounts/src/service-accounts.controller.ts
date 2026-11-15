import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@pistis/core';

import { ApiKeyPage } from './dto/api-key-page.response.js';
import { ApiKeyParams } from './dto/api-key.params.js';
import { CreateApiKeyRequest } from './dto/create-api-key.request.js';
import { CreateServiceAccountRequest } from './dto/create-service-account.request.js';
import { CreatedApiKeyResponse } from './dto/created-api-key.response.js';
import { ListApiKeysQuery } from './dto/list-api-keys.query.js';
import { ListServiceAccountsQuery } from './dto/list-service-accounts.query.js';
import { ServiceAccountPage } from './dto/service-account-page.response.js';
import { ServiceAccountParams } from './dto/service-account.params.js';
import { ServiceAccountResponse } from './dto/service-account.response.js';
import { ServiceAccountsParams } from './dto/service-accounts.params.js';
import { ServiceAccountsService } from './service-accounts.service.js';

@Controller('organizations/:organizationId/service-accounts')
export class ServiceAccountsController {
  constructor(private readonly accounts: ServiceAccountsService) {}

  @Post()
  @RequirePermission('service-account:manage')
  @ZodSerializerDto(ServiceAccountResponse)
  create(
    @Param() { organizationId }: ServiceAccountsParams,
    @Body() body: CreateServiceAccountRequest,
  ) {
    return this.accounts.create(organizationId, body);
  }

  @Get()
  @RequirePermission('member:read')
  @ZodSerializerDto(ServiceAccountPage)
  list(
    @Param() { organizationId }: ServiceAccountsParams,
    @Query() query: ListServiceAccountsQuery,
  ) {
    return this.accounts.list(organizationId, query);
  }

  @Get(':serviceAccountId')
  @RequirePermission('member:read')
  @ZodSerializerDto(ServiceAccountResponse)
  findById(
    @Param() { organizationId, serviceAccountId }: ServiceAccountParams,
  ) {
    return this.accounts.findById(organizationId, serviceAccountId);
  }

  @Post(':serviceAccountId/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('service-account:manage')
  @ZodSerializerDto(ServiceAccountResponse)
  disable(@Param() { organizationId, serviceAccountId }: ServiceAccountParams) {
    return this.accounts.disable(organizationId, serviceAccountId);
  }

  @Post(':serviceAccountId/enable')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('service-account:manage')
  @ZodSerializerDto(ServiceAccountResponse)
  enable(@Param() { organizationId, serviceAccountId }: ServiceAccountParams) {
    return this.accounts.enable(organizationId, serviceAccountId);
  }

  @Post(':serviceAccountId/api-keys')
  @RequirePermission('service-account:manage')
  @ZodSerializerDto(CreatedApiKeyResponse)
  createApiKey(
    @Param() { organizationId, serviceAccountId }: ServiceAccountParams,
    @Body() body: CreateApiKeyRequest,
  ) {
    return this.accounts.createApiKey(organizationId, serviceAccountId, body);
  }

  @Get(':serviceAccountId/api-keys')
  @RequirePermission('member:read')
  @ZodSerializerDto(ApiKeyPage)
  listApiKeys(
    @Param() { organizationId, serviceAccountId }: ServiceAccountParams,
    @Query() query: ListApiKeysQuery,
  ) {
    return this.accounts.listApiKeys(organizationId, serviceAccountId, query);
  }

  @Delete(':serviceAccountId/api-keys/:apiKeyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('service-account:manage')
  revokeApiKey(
    @Param() { organizationId, serviceAccountId, apiKeyId }: ApiKeyParams,
  ) {
    return this.accounts.revokeApiKey(
      organizationId,
      serviceAccountId,
      apiKeyId,
    );
  }
}
