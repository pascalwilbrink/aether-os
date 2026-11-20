import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import {
  ModelKeyList,
  ModelKeyResponse,
  OrganizationModelKeyParams,
  OrganizationModelKeysParams,
  SetModelKeyRequest,
} from './dto/model-key.dto.js';
import { ModelKeysService } from './model-keys.service.js';

/** The organization's provider keys; an agent's own are under the agent. */
@Controller('organizations/:organizationId/model-keys')
export class ModelKeysController {
  constructor(private readonly keys: ModelKeysService) {}

  @Get()
  @RequirePermission('org:read')
  @ZodSerializerDto(ModelKeyList)
  list(@Param() { organizationId }: OrganizationModelKeysParams) {
    return this.keys.list(organizationId, 'organization', organizationId);
  }

  @Put(':provider')
  @RequirePermission('org:secret:write')
  @ZodSerializerDto(ModelKeyResponse)
  set(
    @Param() { organizationId, provider }: OrganizationModelKeyParams,
    @Body() body: SetModelKeyRequest,
  ) {
    return this.keys.set(
      organizationId,
      'organization',
      organizationId,
      provider,
      body,
    );
  }

  @Delete(':provider')
  @RequirePermission('org:secret:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() { organizationId, provider }: OrganizationModelKeyParams,
  ) {
    await this.keys.remove(
      organizationId,
      'organization',
      organizationId,
      provider,
    );
  }
}
