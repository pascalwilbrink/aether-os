import { createZodDto, zListProjectsQuery } from '@hephaestus/core';

/** `?limit=&cursor=`. */
export class ListProjectsQuery extends createZodDto(zListProjectsQuery) {}
