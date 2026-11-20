import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { PlatformAccess } from '@hephaestus/core';

import { AgentVersionChecks } from './agent-version-checks.js';
import { AgentsParams } from './dto/agents.params.js';
import { AgentVersionCheckRequest } from './dto/agent-version-check.request.js';

/**
 * For Agora, with its own token: may an agent version in this organization
 * choose these model, tools and skills? 204, or the 409 that creating the
 * version would get.
 */
@Controller('organizations/:organizationId/agent-version-checks')
export class AgentVersionChecksController {
  constructor(private readonly checks: AgentVersionChecks) {}

  @Post()
  @PlatformAccess('platform:read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async check(
    @Param() { organizationId }: AgentsParams,
    @Body() body: AgentVersionCheckRequest,
  ): Promise<void> {
    await this.checks.assertChoosable(organizationId, body);
  }
}
