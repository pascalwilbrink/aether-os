import { createZodDto, zListDepartmentsPath } from '@polis/core';

export class DepartmentsParams extends createZodDto(zListDepartmentsPath) {}
