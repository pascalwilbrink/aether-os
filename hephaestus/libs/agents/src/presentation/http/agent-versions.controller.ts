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
  type AgentVersionId,
  type OrganizationId,
} from '@hephaestus/core';

import { AgentService } from '../../application/service/agent.service.js';
import { AgentVersionResponse } from './dto/agent-version.response.js';
import { CreateAgentVersionRequest } from './dto/create-agent-version.request.js';

@Controller('organizations/:organizationId/agents/:agentId/versions')
export class AgentVersionsController {
  constructor(private readonly agentService: AgentService) {}

  @Get()
  async list(
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Query() query: PaginationQuery,
  ): Promise<PageResponse<AgentVersionResponse>> {
    const page = await this.agentService.listVersions(
      organizationId as OrganizationId,
      agentId as AgentId,
      query,
    );

    return PageResponse.fromPage(page, (version) =>
      AgentVersionResponse.fromDomain(version),
    );
  }

  @Get(':versionId')
  async findById(
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
  ): Promise<AgentVersionResponse> {
    const version = await this.agentService.findVersionById(
      organizationId as OrganizationId,
      agentId as AgentId,
      versionId as AgentVersionId,
    );

    return AgentVersionResponse.fromDomain(version);
  }

  @Post()
  async create(
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Body() body: CreateAgentVersionRequest,
  ): Promise<AgentVersionResponse> {
    const version = await this.agentService.createVersion({
      id: randomUUID() as AgentVersionId,
      agentId: agentId as AgentId,
      organizationId: organizationId as OrganizationId,
      instructions: body.instructions,
      model: body.model,
      capabilities: body.capabilities,
      tools: body.tools,
      skills: body.skills,
      runtime: body.runtime,
      createdBy: body.createdBy,
    });

    return AgentVersionResponse.fromDomain(version);
  }

  @Post(':versionId/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('organizationId') organizationId: string,
    @Param('agentId') agentId: string,
    @Param('versionId') versionId: string,
  ): Promise<AgentVersionResponse> {
    const version = await this.agentService.publishVersion(
      organizationId as OrganizationId,
      agentId as AgentId,
      versionId as AgentVersionId,
    );

    return AgentVersionResponse.fromDomain(version);
  }
}
