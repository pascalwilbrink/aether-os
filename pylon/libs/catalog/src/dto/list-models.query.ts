import { createZodDto, zListModelsQuery } from '@pylon/core';

/** `?status=&provider=&limit=&cursor=`. */
export class ListModelsQuery extends createZodDto(zListModelsQuery) {}
