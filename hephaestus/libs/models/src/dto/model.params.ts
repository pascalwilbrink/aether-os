import { createZodDto, zGetModelPath } from '@hephaestus/core';

/** `:modelId` (a UUID). */
export class ModelParams extends createZodDto(zGetModelPath) {}
