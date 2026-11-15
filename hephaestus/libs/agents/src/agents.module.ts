import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrganizationsModule } from '@hephaestus/organizations';

import { AgentVersionEntity } from './agent-version.entity.js';
import { AgentVersionMapper } from './agent-version.mapper.js';
import { AgentVersionsController } from './agent-versions.controller.js';
import { AgentVersionsService } from './agent-versions.service.js';
import { AgentEntity } from './agent.entity.js';
import { AgentMapper } from './agent.mapper.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentEntity, AgentVersionEntity]),
    OrganizationsModule,
  ],
  controllers: [AgentsController, AgentVersionsController],
  providers: [
    AgentsService,
    AgentMapper,
    AgentVersionsService,
    AgentVersionMapper,
  ],
  exports: [AgentsService, AgentVersionsService],
})
export class AgentsModule {}
