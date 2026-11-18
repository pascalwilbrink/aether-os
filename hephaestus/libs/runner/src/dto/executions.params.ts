import { createZodDto, zListTaskExecutionsPath } from '@hephaestus/core';

export class ExecutionsParams extends createZodDto(zListTaskExecutionsPath) {}
