import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { AgentsService } from '@pylon/agents';
import {
  PlatformAccess,
  RequirePermission,
  ZodSerializerDto,
} from '@pylon/core';

import { BudgetsService } from './budgets.service.js';
import {
  AgentBudgetParams,
  BudgetCheckParams,
  BudgetCheckRequest,
  BudgetCheckResponse,
  BudgetResponse,
  OrganizationBudgetParams,
  ProjectBudgetParams,
  SetBudgetRequest,
  TaskTreeBudgetParams,
} from './dto/budget.dto.js';

/**
 * Budgets for model calls (docs/models.md, Budgets): an organization's, a
 * project's and an agent's per month, a task tree's over its life; and
 * Hephaestus's check before it starts or resumes a task.
 */
@Controller('organizations/:organizationId')
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly agents: AgentsService,
  ) {}

  @Get('budget')
  @RequirePermission('org:read')
  @ZodSerializerDto(BudgetResponse)
  getOrganization(@Param() { organizationId }: OrganizationBudgetParams) {
    return this.budgets.get(organizationId, 'organization', organizationId);
  }

  @Put('budget')
  @RequirePermission('org:manage')
  @ZodSerializerDto(BudgetResponse)
  setOrganization(
    @Param() { organizationId }: OrganizationBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    return this.budgets.set(
      { organizationId, projectId: null },
      'organization',
      organizationId,
      limitUsd,
    );
  }

  @Get('projects/:projectId/budget')
  @RequirePermission('project:read', { project: 'projectId' })
  @ZodSerializerDto(BudgetResponse)
  getProject(@Param() { organizationId, projectId }: ProjectBudgetParams) {
    return this.budgets.get(organizationId, 'project', projectId);
  }

  @Put('projects/:projectId/budget')
  @RequirePermission('project:manage', { project: 'projectId' })
  @ZodSerializerDto(BudgetResponse)
  setProject(
    @Param() { organizationId, projectId }: ProjectBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    return this.budgets.set(
      { organizationId, projectId },
      'project',
      projectId,
      limitUsd,
    );
  }

  /** Over all the agent's versions and projects; 404 for another organization's. */
  @Get('agents/:agentId/budget')
  @RequirePermission('agent:read')
  @ZodSerializerDto(BudgetResponse)
  async getAgent(@Param() { organizationId, agentId }: AgentBudgetParams) {
    await this.agents.assertExists(organizationId, agentId);
    return this.budgets.get(organizationId, 'agent', agentId);
  }

  /** The organization's call (`org:manage`), like its own budget. */
  @Put('agents/:agentId/budget')
  @RequirePermission('org:manage')
  @ZodSerializerDto(BudgetResponse)
  async setAgent(
    @Param() { organizationId, agentId }: AgentBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    await this.agents.assertExists(organizationId, agentId);
    return this.budgets.set(
      { organizationId, projectId: null },
      'agent',
      agentId,
      limitUsd,
    );
  }

  /**
   * A task tree's, by its top-level task. Pylon doesn't know tasks:
   * Hephaestus checks the tree is the project's and passes the caller's
   * token on (docs/pylon.md, Budgets and pausing).
   */
  @Get('projects/:projectId/task-trees/:taskTreeId/budget')
  @RequirePermission('task:read', { project: 'projectId' })
  @PlatformAccess('platform:read')
  @ZodSerializerDto(BudgetResponse)
  getTaskTree(@Param() { organizationId, taskTreeId }: TaskTreeBudgetParams) {
    return this.budgets.get(organizationId, 'task_tree', taskTreeId);
  }

  @Put('projects/:projectId/task-trees/:taskTreeId/budget')
  @RequirePermission('task:create', { project: 'projectId' })
  @ZodSerializerDto(BudgetResponse)
  setTaskTree(
    @Param() { organizationId, projectId, taskTreeId }: TaskTreeBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    return this.budgets.set(
      { organizationId, projectId },
      'task_tree',
      taskTreeId,
      limitUsd,
    );
  }

  /** Hephaestus, before it starts or resumes an execution. */
  @Post('budget-checks')
  @HttpCode(HttpStatus.OK)
  @PlatformAccess('platform:read')
  @ZodSerializerDto(BudgetCheckResponse)
  async check(
    @Param() { organizationId }: BudgetCheckParams,
    @Body() body: BudgetCheckRequest,
  ) {
    return {
      exhausted: await this.budgets.exhausted({
        organizationId,
        projectId: body.projectId,
        agentId: body.agentId ?? null,
        taskTreeId: body.taskTreeId ?? null,
      }),
    };
  }
}
