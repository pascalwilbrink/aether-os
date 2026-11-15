import { createZodDto, zListOrganizationsQuery } from '@hephaestus/core';

/** `?limit=&cursor=`. */
export class ListOrganizationsQuery extends createZodDto(
  zListOrganizationsQuery,
) {}
