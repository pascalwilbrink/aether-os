import { Controller, Get, Param, Query } from '@nestjs/common';

import {
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@pylon/core';

import { UsageParams, UsageQuery, UsageResponse } from './dto/usage.dto.js';
import { ModelCallsService } from './model-calls.service.js';

/** What an organization's model calls used and cost. */
@Controller('organizations/:organizationId/usage')
export class UsageController {
  constructor(private readonly calls: ModelCallsService) {}

  @Get()
  @RequirePermission('org:read')
  @PlatformAccess('platform:read')
  @ZodSerializerDto(UsageResponse)
  get(
    @Param() { organizationId }: UsageParams,
    @Query() { executionId, from, to, ...filters }: UsageQuery,
  ) {
    return this.calls.usage(organizationId, {
      ...filters,
      executionIds: executionId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
