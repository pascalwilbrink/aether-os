import { createZodDto, zListAgentVersionsQuery } from '@agora/core';

/** `?limit=&cursor=`. */
export class ListAgentVersionsQuery extends createZodDto(
  zListAgentVersionsQuery,
) {}
