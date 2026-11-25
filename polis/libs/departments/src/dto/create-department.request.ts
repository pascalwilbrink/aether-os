import { createZodDto, zCreateDepartmentRequest } from '@polis/core';

export class CreateDepartmentRequest extends createZodDto(
  zCreateDepartmentRequest,
) {}
