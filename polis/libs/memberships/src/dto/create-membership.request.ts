import { createZodDto, zCreateMembershipRequest } from '@polis/core';

export class CreateMembershipRequest extends createZodDto(
  zCreateMembershipRequest,
) {}
