import { createZodDto, zGetTaskTemplatePath } from '@hephaestus/core';

export class TaskTemplateParams extends createZodDto(zGetTaskTemplatePath) {}
