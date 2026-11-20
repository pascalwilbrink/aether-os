import {
  createZodDto,
  zGetUsagePath,
  zGetUsageQuery,
  zUsageResponse,
} from '@pylon/core';

/** `:organizationId`. */
export class UsageParams extends createZodDto(zGetUsagePath) {}

export class UsageQuery extends createZodDto(zGetUsageQuery) {}

export class UsageResponse extends createZodDto(zUsageResponse) {}
