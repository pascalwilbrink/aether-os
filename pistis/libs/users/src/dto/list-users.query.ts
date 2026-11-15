import { createZodDto, zListUsersQuery } from '@pistis/core';

/** `?limit=&cursor=`. */
export class ListUsersQuery extends createZodDto(zListUsersQuery) {}
