import { createZodDto, zGetDepartmentPath } from '@polis/core';

export class DepartmentParams extends createZodDto(zGetDepartmentPath) {}
