import { createZodDto, zListTaskTemplatesPath } from '@hephaestus/core';

export class TaskTemplatesParams extends createZodDto(zListTaskTemplatesPath) {}
