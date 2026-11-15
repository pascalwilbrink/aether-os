import { createZodDto, zListMembershipsPath } from '@polis/core';

/** `:organizationId` (a UUID). */
export class MembershipsParams extends createZodDto(zListMembershipsPath) {}
