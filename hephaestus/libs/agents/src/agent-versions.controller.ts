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

import { AgentVersionsService } from './agent-versions.service.js';
import { AgentParams } from './dto/agent.params.js';
import { AgentVersionPage } from './dto/agent-version-page.response.js';
import { AgentVersionParams } from './dto/agent-version.params.js';
import { AgentVersionResponse } from './dto/agent-version.response.js';
import { CreateAgentVersionRequest } from './dto/create-agent-version.request.js';
import { ListAgentVersionsQuery } from './dto/list-agent-versions.query.js';

@Controller('organizations/:organizationId/agents/:agentId/versions')
export class AgentVersionsController {
  constructor(private readonly versions: AgentVersionsService) {}

  @Post()
  @RequirePermission('agent:write')
  @ZodSerializerDto(AgentVersionResponse)
  create(
    @Param() { organizationId, agentId }: AgentParams,
    @Body() body: CreateAgentVersionRequest,
  ) {
    return this.versions.create(organizationId, agentId, body);
  }

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(AgentVersionPage)
  list(
    @Param() { organizationId, agentId }: AgentParams,
    @Query() query: ListAgentVersionsQuery,
  ) {
    return this.versions.list(organizationId, agentId, query);
  }

  @Get(':versionId')
  @RequirePermission('agent:read')
  @ZodSerializerDto(AgentVersionResponse)
  findById(
    @Param() { organizationId, agentId, versionId }: AgentVersionParams,
  ) {
    return this.versions.findById(organizationId, agentId, versionId);
  }

  @Post(':versionId/publish')
  @RequirePermission('agent:publish')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AgentVersionResponse)
  publish(@Param() { organizationId, agentId, versionId }: AgentVersionParams) {
    return this.versions.publish(organizationId, agentId, versionId);
  }
}
