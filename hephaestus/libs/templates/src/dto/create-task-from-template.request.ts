import { createZodDto, zCreateTaskFromTemplateRequest } from '@hephaestus/core';

export class CreateTaskFromTemplateRequest extends createZodDto(
  zCreateTaskFromTemplateRequest,
) {}
