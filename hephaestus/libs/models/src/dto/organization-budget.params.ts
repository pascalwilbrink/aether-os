import { createZodDto, zGetOrganizationBudgetPath } from '@hephaestus/core';

/** `:organizationId`. */
export class OrganizationBudgetParams extends createZodDto(
  zGetOrganizationBudgetPath,
) {}
