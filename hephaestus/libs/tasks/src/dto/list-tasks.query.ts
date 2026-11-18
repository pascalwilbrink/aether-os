import { createZodDto, zListTasksQuery } from '@hephaestus/core';

export class ListTasksQuery extends createZodDto(zListTasksQuery) {}
