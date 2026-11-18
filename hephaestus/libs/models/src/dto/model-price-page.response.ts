import { createZodDto, zModelPricePage } from '@hephaestus/core';

/** Newest `effectiveFrom` first. */
export class ModelPricePage extends createZodDto(zModelPricePage) {}
