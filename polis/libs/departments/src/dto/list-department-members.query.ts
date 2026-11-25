import { createZodDto, zListDepartmentMembersQuery } from '@polis/core';

export class ListDepartmentMembersQuery extends createZodDto(
  zListDepartmentMembersQuery,
) {}
