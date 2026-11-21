import { createZodDto, zRepositoryFilesResponse } from '@proxenos/core';

export class RepositoryFilesResponse extends createZodDto(
  zRepositoryFilesResponse,
) {}
