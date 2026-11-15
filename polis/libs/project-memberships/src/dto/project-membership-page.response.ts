import { createZodDto, zProjectMembershipPage } from '@polis/core';

export class ProjectMembershipPage extends createZodDto(
  zProjectMembershipPage,
) {}
