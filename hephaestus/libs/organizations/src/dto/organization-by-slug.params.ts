import { createZodDto, zGetOrganizationBySlugPath } from '@hephaestus/core';

export class OrganizationBySlugParams extends createZodDto(
  zGetOrganizationBySlugPath,
) {}
