import { createZodDto, zTaskTemplateVersionResponse } from '@hephaestus/core';

export class TaskTemplateVersionResponse extends createZodDto(
  zTaskTemplateVersionResponse,
) {}
