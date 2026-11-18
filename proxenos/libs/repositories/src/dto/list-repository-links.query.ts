import { createZodDto, zListRepositoryLinksQuery } from '@proxenos/core';

export class ListRepositoryLinksQuery extends createZodDto(
  zListRepositoryLinksQuery,
) {}
