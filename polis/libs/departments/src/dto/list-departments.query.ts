import { createZodDto, zListDepartmentsQuery } from '@polis/core';

export class ListDepartmentsQuery extends createZodDto(zListDepartmentsQuery) {}
