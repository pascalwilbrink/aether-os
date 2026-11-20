import { createZodDto, zModelPricePage } from '@pylon/core';

/** Newest `effectiveFrom` first. */
export class ModelPricePage extends createZodDto(zModelPricePage) {}
