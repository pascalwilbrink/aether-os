import { createZodDto, zRemoveDepartmentMemberPath } from '@polis/core';

export class DepartmentMemberParams extends createZodDto(
  zRemoveDepartmentMemberPath,
) {}
