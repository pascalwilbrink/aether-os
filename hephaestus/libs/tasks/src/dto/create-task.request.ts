import { createZodDto, zCreateTaskRequest } from '@hephaestus/core';

export class CreateTaskRequest extends createZodDto(zCreateTaskRequest) {}
