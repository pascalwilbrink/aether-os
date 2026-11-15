import { createZodDto, zGetServiceAccountPath } from '@pistis/core';

export class ServiceAccountParams extends createZodDto(
  zGetServiceAccountPath,
) {}
