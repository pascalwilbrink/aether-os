import { createZodDto, zListAgentsQuery } from '@agora/core';

/** `?limit=&cursor=`. */
export class ListAgentsQuery extends createZodDto(zListAgentsQuery) {}
