import { createZodDto, zListPersonsQuery } from '@polis/core';

export class ListPersonsQuery extends createZodDto(zListPersonsQuery) {}
