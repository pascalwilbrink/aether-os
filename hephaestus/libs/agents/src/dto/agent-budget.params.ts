import { createZodDto, zGetAgentBudgetPath } from '@hephaestus/core';

/** `:organizationId` and `:agentId`. */
export class AgentBudgetParams extends createZodDto(zGetAgentBudgetPath) {}
