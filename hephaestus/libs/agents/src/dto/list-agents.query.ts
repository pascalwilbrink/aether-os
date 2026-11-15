import { createZodDto, zListAgentsQuery } from '@hephaestus/core';

/** `?limit=&cursor=`. */
export class ListAgentsQuery extends createZodDto(zListAgentsQuery) {}
