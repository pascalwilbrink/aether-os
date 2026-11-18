import { createZodDto, zListRepositoryLinksPath } from '@proxenos/core';

export class ProjectRepositoriesParams extends createZodDto(
  zListRepositoryLinksPath,
) {}
