import { createZodDto, zListModelPricesQuery } from '@pylon/core';

/** `?limit=&cursor=`. */
export class ListModelPricesQuery extends createZodDto(zListModelPricesQuery) {}
