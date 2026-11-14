import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import {
  PageResponse,
  PaginationQuery,
  type AgentId,
  type OrganizationId,
} from '@hephaestus/core';

import { AgentService } from '../../application/service/agent.service.js';
import { AgentResponse } from './dto/agent.response.js';
import { CreateAgentRequest } from './dto/create-agent.request.js';

@Controller('organizations/:organizationId/agents')
export class AgentsController {
  constructor(private readonly agentService: AgentService) {}

  @Post()
  async create(
    @Param('organizationId') organizationId: string,
    @Body() body: CreateAgentRequest,
  ): Promise<AgentResponse> {
    const agent = await this.agentService.create({
      id: randomUUID() as AgentId,
      organizationId: organizationId as OrganizationId,
      name: body.name,
      description: body.description,
      createdBy: body.createdBy,
    });

    return AgentResponse.fromDomain(agent);
  }

  @Get()
  async list(
    @Param('organizationId') organizationId: string,
    @Query() query: PaginationQuery,
  ): Promise<PageResponse<AgentResponse>> {
    const page = await this.agentService.list(
      organizationId as OrganizationId,
      query,
    );

    return PageResponse.fromPage(page, (agent) => AgentResponse.fromDomain(agent));
  }

  @Get(':agentId')
  async findById(
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
  ): Promise<AgentResponse> {
    const agent = await this.agentService.findById(
      organizationId as OrganizationId,
      agentId as AgentId,
    );

    return AgentResponse.fromDomain(agent);
  }

  @Post(':agentId/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
  ): Promise<void> {
    await this.agentService.archive(
      organizationId as OrganizationId,
      agentId as AgentId,
    );
  }
}
