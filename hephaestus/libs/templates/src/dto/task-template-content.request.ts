import { createZodDto, zTaskTemplateContent } from '@hephaestus/core';

export class TaskTemplateContentRequest extends createZodDto(
  zTaskTemplateContent,
) {}
