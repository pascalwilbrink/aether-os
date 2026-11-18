import { createZodDto, zListInstallationsQuery } from '@proxenos/core';

export class ListInstallationsQuery extends createZodDto(
  zListInstallationsQuery,
) {}
