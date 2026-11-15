import { createZodDto, zUpdateProjectMembershipRequest } from '@polis/core';

export class UpdateProjectMembershipRequest extends createZodDto(
  zUpdateProjectMembershipRequest,
) {}
