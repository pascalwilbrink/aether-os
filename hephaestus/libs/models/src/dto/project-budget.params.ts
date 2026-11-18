import { createZodDto, zGetProjectBudgetPath } from '@hephaestus/core';

/** `:organizationId` and `:projectId`. */
export class ProjectBudgetParams extends createZodDto(zGetProjectBudgetPath) {}
