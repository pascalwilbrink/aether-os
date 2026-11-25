import { createZodDto, zAddDepartmentMemberRequest } from '@polis/core';

export class AddDepartmentMemberRequest extends createZodDto(
  zAddDepartmentMemberRequest,
) {}
