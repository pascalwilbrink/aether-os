import { createZodDto, zListMembershipsQuery } from '@polis/core';

/** `?subjectType=&limit=&cursor=`. */
export class ListMembershipsQuery extends createZodDto(zListMembershipsQuery) {}
