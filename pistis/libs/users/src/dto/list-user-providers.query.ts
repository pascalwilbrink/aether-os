import { createZodDto, zListUserProvidersQuery } from '@pistis/core';

/** `?limit=&cursor=`. */
export class ListUserProvidersQuery extends createZodDto(
  zListUserProvidersQuery,
) {}
