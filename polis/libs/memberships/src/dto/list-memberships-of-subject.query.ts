import { createZodDto, zListMembershipsOfSubjectQuery } from '@polis/core';

/** `?subjectType=&subject=&limit=&cursor=`. */
export class ListMembershipsOfSubjectQuery extends createZodDto(
  zListMembershipsOfSubjectQuery,
) {}
