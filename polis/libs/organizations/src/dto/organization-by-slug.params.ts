import { createZodDto, zGetOrganizationBySlugPath } from '@polis/core';

export class OrganizationBySlugParams extends createZodDto(
  zGetOrganizationBySlugPath,
) {}
