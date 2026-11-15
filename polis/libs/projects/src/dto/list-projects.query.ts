import { createZodDto, zListProjectsQuery } from '@polis/core';

/** `?limit=&cursor=`. */
export class ListProjectsQuery extends createZodDto(zListProjectsQuery) {}
