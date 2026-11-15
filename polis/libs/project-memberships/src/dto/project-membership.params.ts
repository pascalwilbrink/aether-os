import { createZodDto, zGetProjectMembershipPath } from '@polis/core';

export class ProjectMembershipParams extends createZodDto(
  zGetProjectMembershipPath,
) {}
