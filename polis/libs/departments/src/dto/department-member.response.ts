import { createZodDto, zDepartmentMemberResponse } from '@polis/core';

export class DepartmentMemberResponse extends createZodDto(
  zDepartmentMemberResponse,
) {}
