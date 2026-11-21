import { createZodDto, zGetRepositoryBlobPath } from '@proxenos/core';

export class RepositoryBlobParams extends createZodDto(
  zGetRepositoryBlobPath,
) {}
