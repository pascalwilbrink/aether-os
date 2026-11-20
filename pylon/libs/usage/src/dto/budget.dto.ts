import {
  createZodDto,
  zBudgetCheckRequest,
  zBudgetCheckResponse,
  zBudgetResponse,
  zCheckBudgetsPath,
  zGetAgentBudgetPath,
  zGetOrganizationBudgetPath,
  zGetProjectBudgetPath,
  zGetTaskTreeBudgetPath,
  zSetBudgetRequest,
} from '@pylon/core';

export class BudgetResponse extends createZodDto(zBudgetResponse) {}

/** PUT: the limit, or null for none. */
export class SetBudgetRequest extends createZodDto(zSetBudgetRequest) {}

/** `:organizationId`. */
export class OrganizationBudgetParams extends createZodDto(
  zGetOrganizationBudgetPath,
) {}

/** `:organizationId` and `:projectId`. */
export class ProjectBudgetParams extends createZodDto(zGetProjectBudgetPath) {}

/** `:organizationId` and `:agentId`. */
export class AgentBudgetParams extends createZodDto(zGetAgentBudgetPath) {}

/** `:organizationId`, `:projectId` and `:taskTreeId`. */
export class TaskTreeBudgetParams extends createZodDto(
  zGetTaskTreeBudgetPath,
) {}

/** `:organizationId`. */
export class BudgetCheckParams extends createZodDto(zCheckBudgetsPath) {}

export class BudgetCheckRequest extends createZodDto(zBudgetCheckRequest) {}

export class BudgetCheckResponse extends createZodDto(zBudgetCheckResponse) {}
