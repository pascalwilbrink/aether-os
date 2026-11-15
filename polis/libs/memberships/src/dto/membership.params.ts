import { createZodDto, zGetMembershipPath } from '@polis/core';

/** `:organizationId` and `:membershipId` (UUIDs). */
export class MembershipParams extends createZodDto(zGetMembershipPath) {}
