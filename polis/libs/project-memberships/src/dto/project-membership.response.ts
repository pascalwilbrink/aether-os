import { createZodDto, zProjectMembershipResponse } from '@polis/core';

export class ProjectMembershipResponse extends createZodDto(
  zProjectMembershipResponse,
) {}
