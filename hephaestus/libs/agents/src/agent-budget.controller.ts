import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';
import {
  BudgetResponse,
  BudgetsService,
  SetBudgetRequest,
} from '@hephaestus/models';

import { AgentsService } from './agents.service.js';
import { AgentBudgetParams } from './dto/agent-budget.params.js';

/**
 * An agent's monthly budget for model calls (docs/models.md, Budgets), over
 * all its versions and projects: the agent is checked here (404 for another
 * organization's), the budget handled by `BudgetsService`. Setting it is
 * the organization's call (`org:manage`), like the organization's own.
 */
@Controller('organizations/:organizationId/agents/:agentId/budget')
export class AgentBudgetController {
  constructor(
    private readonly agents: AgentsService,
    private readonly budgets: BudgetsService,
  ) {}

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(BudgetResponse)
  async get(@Param() { organizationId, agentId }: AgentBudgetParams) {
    await this.agents.assertExists(organizationId, agentId);
    return this.budgets.getAgent(organizationId, agentId);
  }

  @Put()
  @RequirePermission('org:manage')
  @ZodSerializerDto(BudgetResponse)
  async set(
    @Param() { organizationId, agentId }: AgentBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    await this.agents.assertExists(organizationId, agentId);
    return this.budgets.setAgent(organizationId, agentId, limitUsd);
  }
}
