import { createZodDto, zListRepositoriesQuery } from '@proxenos/core';

export class ListRepositoriesQuery extends createZodDto(
  zListRepositoriesQuery,
) {}
