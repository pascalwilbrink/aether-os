import { createZodDto, zUpdateDepartmentRequest } from '@polis/core';

export class UpdateDepartmentRequest extends createZodDto(
  zUpdateDepartmentRequest,
) {}
