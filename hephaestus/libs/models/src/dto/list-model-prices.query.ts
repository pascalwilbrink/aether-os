import { createZodDto, zListModelPricesQuery } from '@hephaestus/core';

/** `?limit=&cursor=`. */
export class ListModelPricesQuery extends createZodDto(zListModelPricesQuery) {}
