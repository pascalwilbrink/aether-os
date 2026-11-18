import { createZodDto, zListModelsQuery } from '@hephaestus/core';

/** `?status=&provider=&limit=&cursor=`. */
export class ListModelsQuery extends createZodDto(zListModelsQuery) {}
