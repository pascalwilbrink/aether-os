import { createZodDto, zListTaskTemplatesQuery } from '@hephaestus/core';

export class ListTaskTemplatesQuery extends createZodDto(
  zListTaskTemplatesQuery,
) {}
