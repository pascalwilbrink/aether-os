import { createZodDto, zListMembershipsQuery } from '@polis/core';

/** `?limit=&cursor=`. */
export class ListMembershipsQuery extends createZodDto(zListMembershipsQuery) {}
