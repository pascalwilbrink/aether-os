import { createZodDto, zCreateProjectMembershipRequest } from '@polis/core';

export class CreateProjectMembershipRequest extends createZodDto(
  zCreateProjectMembershipRequest,
) {}
