import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';

import {
  CreateToolServerRequest,
  SetToolServerCredentialRequest,
  ToolList,
  ToolServerList,
  ToolServerParams,
  ToolServerResponse,
  ToolServersParams,
  UpdateToolServerRequest,
} from './dto/tool-server.dto.js';
import { ToolServersService } from './tool-servers.service.js';

/** The organization's tool servers (MCP) and their credentials. */
@Controller('organizations/:organizationId/tool-servers')
export class ToolServersController {
  constructor(private readonly servers: ToolServersService) {}

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(ToolServerList)
  list(@Param() { organizationId }: ToolServersParams) {
    return this.servers.list(organizationId);
  }

  @Post()
  @RequirePermission('org:manage')
  @ZodSerializerDto(ToolServerResponse)
  create(
    @Param() { organizationId }: ToolServersParams,
    @Body() body: CreateToolServerRequest,
  ) {
    return this.servers.create(organizationId, body);
  }

  @Get(':toolServerId')
  @RequirePermission('agent:read')
  @ZodSerializerDto(ToolServerResponse)
  get(@Param() { organizationId, toolServerId }: ToolServerParams) {
    return this.servers.get(organizationId, toolServerId);
  }

  @Put(':toolServerId')
  @RequirePermission('org:manage')
  @ZodSerializerDto(ToolServerResponse)
  update(
    @Param() { organizationId, toolServerId }: ToolServerParams,
    @Body() body: UpdateToolServerRequest,
  ) {
    return this.servers.update(organizationId, toolServerId, body);
  }

  @Delete(':toolServerId')
  @RequirePermission('org:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param() { organizationId, toolServerId }: ToolServerParams) {
    await this.servers.remove(organizationId, toolServerId);
  }

  @Put(':toolServerId/credential')
  @RequirePermission('org:secret:write')
  @ZodSerializerDto(ToolServerResponse)
  setCredential(
    @Param() { organizationId, toolServerId }: ToolServerParams,
    @Body() { value }: SetToolServerCredentialRequest,
  ) {
    return this.servers.setCredential(organizationId, toolServerId, value);
  }

  @Delete(':toolServerId/credential')
  @RequirePermission('org:secret:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCredential(
    @Param() { organizationId, toolServerId }: ToolServerParams,
  ) {
    await this.servers.removeCredential(organizationId, toolServerId);
  }

  @Get(':toolServerId/tools')
  @RequirePermission('agent:read')
  @ZodSerializerDto(ToolList)
  tools(
    @Param() { organizationId, toolServerId }: ToolServerParams,
    @Headers('authorization') authorization: string,
  ) {
    return this.servers.listTools(
      organizationId,
      toolServerId,
      authorization.replace(/^Bearer\s+/i, ''),
    );
  }
}
