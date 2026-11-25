import { createZodDto, zListProjectsQuery } from '@polis/core';

/** `?departmentId=&limit=&cursor=`. */
export class ListProjectsQuery extends createZodDto(zListProjectsQuery) {}
