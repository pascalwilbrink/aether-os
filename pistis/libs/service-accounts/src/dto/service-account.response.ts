import { createZodDto, zServiceAccountResponse } from '@pistis/core';

export class ServiceAccountResponse extends createZodDto(
  zServiceAccountResponse,
) {}
