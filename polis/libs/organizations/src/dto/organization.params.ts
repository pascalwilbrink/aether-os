import { createZodDto, zGetOrganizationPath } from '@polis/core';

/** `:organizationId` (a UUID). */
export class OrganizationParams extends createZodDto(zGetOrganizationPath) {}
