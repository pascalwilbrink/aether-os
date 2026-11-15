import { createZodDto, zCreatedApiKeyResponse } from '@pistis/core';

export class CreatedApiKeyResponse extends createZodDto(
  zCreatedApiKeyResponse,
) {}
