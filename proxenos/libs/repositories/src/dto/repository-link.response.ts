import { createZodDto, zRepositoryLinkResponse } from '@proxenos/core';

export class RepositoryLinkResponse extends createZodDto(
  zRepositoryLinkResponse,
) {}
