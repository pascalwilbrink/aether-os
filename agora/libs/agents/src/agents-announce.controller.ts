import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

import { PlatformAccess, ZodSerializerDto } from '@agora/core';

import { AgentsService } from './agents.service.js';
import { AnnouncementResponse } from './dto/announcement.response.js';

/** Platform operators: every organization's agents, published again. */
@Controller('agents')
@PlatformAccess('platform:manage')
export class AgentsAnnounceController {
  constructor(private readonly agents: AgentsService) {}

  /** The backfill for services that keep a copy of the agents (Ergon, Pylon, Hephaestus). */
  @Post('announce')
  @HttpCode(HttpStatus.OK)
  @ZodSerializerDto(AnnouncementResponse)
  async announce() {
    return { announced: await this.agents.announce() };
  }
}
