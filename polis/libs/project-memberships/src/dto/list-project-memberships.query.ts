import { createZodDto, zListProjectMembershipsQuery } from '@polis/core';

export class ListProjectMembershipsQuery extends createZodDto(
  zListProjectMembershipsQuery,
) {}
