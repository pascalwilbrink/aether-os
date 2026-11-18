import { createZodDto, zListTasksPath } from '@hephaestus/core';

export class TasksParams extends createZodDto(zListTasksPath) {}
