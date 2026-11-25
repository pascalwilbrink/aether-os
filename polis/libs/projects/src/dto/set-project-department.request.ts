import { createZodDto, zSetProjectDepartmentRequest } from '@polis/core';

/** `{ departmentId }`, or `null` to take it out of its department. */
export class SetProjectDepartmentRequest extends createZodDto(
  zSetProjectDepartmentRequest,
) {}
