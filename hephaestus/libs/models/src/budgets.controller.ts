import { Body, Controller, Get, Param, Put } from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import { BudgetsService } from './budgets.service.js';
import { BudgetResponse } from './dto/budget.response.js';
import { OrganizationBudgetParams } from './dto/organization-budget.params.js';
import { ProjectBudgetParams } from './dto/project-budget.params.js';
import { SetBudgetRequest } from './dto/set-budget.request.js';

/**
 * An organization's and a project's monthly budgets for model calls
 * (docs/models.md, Budgets). A task tree's is under its task
 * (`TasksController`).
 */
@Controller('organizations/:organizationId')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get('budget')
  @RequirePermission('org:read')
  @ZodSerializerDto(BudgetResponse)
  getOrganization(@Param() { organizationId }: OrganizationBudgetParams) {
    return this.budgets.getOrganization(organizationId);
  }

  @Put('budget')
  @RequirePermission('org:manage')
  @ZodSerializerDto(BudgetResponse)
  setOrganization(
    @Param() { organizationId }: OrganizationBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    return this.budgets.setOrganization(organizationId, limitUsd);
  }

  @Get('projects/:projectId/budget')
  @RequirePermission('project:read', { project: 'projectId' })
  @ZodSerializerDto(BudgetResponse)
  getProject(@Param() { organizationId, projectId }: ProjectBudgetParams) {
    return this.budgets.getProject(organizationId, projectId);
  }

  @Put('projects/:projectId/budget')
  @RequirePermission('project:manage', { project: 'projectId' })
  @ZodSerializerDto(BudgetResponse)
  setProject(
    @Param() { organizationId, projectId }: ProjectBudgetParams,
    @Body() { limitUsd }: SetBudgetRequest,
  ) {
    return this.budgets.setProject(organizationId, projectId, limitUsd);
  }
}
