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

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import { AgentPage } from './dto/agent-page.response.js';
import { AgentParams } from './dto/agent.params.js';
import { AgentResponse } from './dto/agent.response.js';
import { AgentsParams } from './dto/agents.params.js';
import { CreateAgentRequest } from './dto/create-agent.request.js';
import { ListAgentsQuery } from './dto/list-agents.query.js';
import { AgentsService } from './agents.service.js';

@Controller('organizations/:organizationId/agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  @RequirePermission('agent:write')
  @ZodSerializerDto(AgentResponse)
  create(
    @Param() { organizationId }: AgentsParams,
    @Body() body: CreateAgentRequest,
  ) {
    return this.agents.create(organizationId, body);
  }

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(AgentPage)
  list(
    @Param() { organizationId }: AgentsParams,
    @Query() query: ListAgentsQuery,
  ) {
    return this.agents.list(organizationId, query);
  }

  @Get(':agentId')
  @RequirePermission('agent:read')
  @ZodSerializerDto(AgentResponse)
  findById(@Param() { organizationId, agentId }: AgentParams) {
    return this.agents.findById(organizationId, agentId);
  }

  @Post(':agentId/archive')
  @RequirePermission('agent:write')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AgentResponse)
  archive(@Param() { organizationId, agentId }: AgentParams) {
    return this.agents.archive(organizationId, agentId);
  }
}
