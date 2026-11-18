import { createZodDto, zCreateTaskTemplateRequest } from '@hephaestus/core';

export class CreateTaskTemplateRequest extends createZodDto(
  zCreateTaskTemplateRequest,
) {}
