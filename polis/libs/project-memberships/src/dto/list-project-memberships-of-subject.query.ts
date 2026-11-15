import {
  createZodDto,
  zListProjectMembershipsOfSubjectQuery,
} from '@polis/core';

export class ListProjectMembershipsOfSubjectQuery extends createZodDto(
  zListProjectMembershipsOfSubjectQuery,
) {}
