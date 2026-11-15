import { createZodDto, zGetOrganizationPath } from '@hephaestus/core';

/** `:organizationId` (a UUID). */
export class OrganizationParams extends createZodDto(zGetOrganizationPath) {}
