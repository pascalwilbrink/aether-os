import { createZodDto, zGetTaskTemplateVersionPath } from '@hephaestus/core';

export class TaskTemplateVersionParams extends createZodDto(
  zGetTaskTemplateVersionPath,
) {}
