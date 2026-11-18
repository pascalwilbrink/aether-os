import { createZodDto, zListTaskExecutionsQuery } from '@hephaestus/core';

export class ListExecutionsQuery extends createZodDto(
  zListTaskExecutionsQuery,
) {}
