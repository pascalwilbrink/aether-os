import { createZodDto, zListWorkspacesQuery } from '@hephaestus/core';

/** `?limit=&cursor=`. */
export class ListWorkspacesQuery extends createZodDto(zListWorkspacesQuery) {}
