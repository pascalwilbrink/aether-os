import { createZodDto, zSubjectMembershipPage } from '@polis/core';

export class SubjectMembershipPage extends createZodDto(
  zSubjectMembershipPage,
) {}
