import { createZodDto, zGetTaskPath } from '@hephaestus/core';

export class TaskParams extends createZodDto(zGetTaskPath) {}
