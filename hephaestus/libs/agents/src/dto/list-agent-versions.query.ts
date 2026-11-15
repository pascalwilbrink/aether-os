import { createZodDto, zListAgentVersionsQuery } from '@hephaestus/core';

/** `?limit=&cursor=`. */
export class ListAgentVersionsQuery extends createZodDto(
  zListAgentVersionsQuery,
) {}
