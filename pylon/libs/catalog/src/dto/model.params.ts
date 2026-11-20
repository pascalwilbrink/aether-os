import { createZodDto, zGetModelPath } from '@pylon/core';

/** `:modelId` (a UUID). */
export class ModelParams extends createZodDto(zGetModelPath) {}
