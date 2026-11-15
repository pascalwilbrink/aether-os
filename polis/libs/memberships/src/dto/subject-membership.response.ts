import { createZodDto, zSubjectMembershipResponse } from '@polis/core';

/** A membership with its organization's name and slug. */
export class SubjectMembershipResponse extends createZodDto(
  zSubjectMembershipResponse,
) {}
