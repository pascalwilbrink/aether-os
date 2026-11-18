import { createZodDto, zGetRepositoryLinkPath } from '@proxenos/core';

export class RepositoryLinkParams extends createZodDto(
  zGetRepositoryLinkPath,
) {}
