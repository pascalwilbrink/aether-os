import { createZodDto, zListTaskTemplateVersionsQuery } from '@hephaestus/core';

export class ListTaskTemplateVersionsQuery extends createZodDto(
  zListTaskTemplateVersionsQuery,
) {}
