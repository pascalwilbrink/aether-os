import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
} from '@nestjs/common';

import { RequirePermission, ZodSerializerDto } from '@hephaestus/core';
import {
  ModelKeyList,
  ModelKeyResponse,
  ModelKeysService,
  SetModelKeyRequest,
} from '@hephaestus/models';

import { AgentsService } from './agents.service.js';
import {
  AgentModelKeyParams,
  AgentModelKeysParams,
} from './dto/agent-model-key.params.js';

/**
 * An agent's own provider keys (docs/models.md, Keys), used instead of the
 * organization's: the agent is checked here (404 for another
 * organization's), the keys handled by `ModelKeysService`.
 */
@Controller('organizations/:organizationId/agents/:agentId/model-keys')
export class AgentModelKeysController {
  constructor(
    private readonly agents: AgentsService,
    private readonly keys: ModelKeysService,
  ) {}

  @Get()
  @RequirePermission('agent:read')
  @ZodSerializerDto(ModelKeyList)
  async list(@Param() { organizationId, agentId }: AgentModelKeysParams) {
    await this.agents.assertExists(organizationId, agentId);
    return this.keys.list(organizationId, 'agent', agentId);
  }

  @Put(':provider')
  @RequirePermission('org:secret:write')
  @ZodSerializerDto(ModelKeyResponse)
  async set(
    @Param() { organizationId, agentId, provider }: AgentModelKeyParams,
    @Body() { apiKey }: SetModelKeyRequest,
  ) {
    await this.agents.assertExists(organizationId, agentId);
    return this.keys.set(organizationId, 'agent', agentId, provider, apiKey);
  }

  @Delete(':provider')
  @RequirePermission('org:secret:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param() { organizationId, agentId, provider }: AgentModelKeyParams,
  ) {
    await this.agents.assertExists(organizationId, agentId);
    await this.keys.remove(organizationId, 'agent', agentId, provider);
  }
}
