import { createZodDto, zCreateTaskFromTemplatePath } from '@hephaestus/core';

export class TemplatedTaskParams extends createZodDto(
  zCreateTaskFromTemplatePath,
) {}
