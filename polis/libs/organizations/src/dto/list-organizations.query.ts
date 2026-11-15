import { createZodDto, zListOrganizationsQuery } from '@polis/core';

/** `?limit=&cursor=`. */
export class ListOrganizationsQuery extends createZodDto(
  zListOrganizationsQuery,
) {}
