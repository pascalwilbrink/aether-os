import { createZodDto, zRepositoryTokenResponse } from '@proxenos/core';

export class RepositoryTokenResponse extends createZodDto(
  zRepositoryTokenResponse,
) {}
