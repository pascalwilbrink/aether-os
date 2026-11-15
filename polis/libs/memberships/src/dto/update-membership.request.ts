import { createZodDto, zUpdateMembershipRequest } from '@polis/core';

/** PUT: the roles, replaced as a whole. */
export class UpdateMembershipRequest extends createZodDto(
  zUpdateMembershipRequest,
) {}
