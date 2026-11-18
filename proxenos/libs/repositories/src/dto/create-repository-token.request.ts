import { createZodDto, zCreateRepositoryTokenRequest } from '@proxenos/core';

export class CreateRepositoryTokenRequest extends createZodDto(
  zCreateRepositoryTokenRequest,
) {}
