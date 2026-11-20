import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ModelsModule } from '@hephaestus/models';
import { TenancyModule } from '@hephaestus/tenancy';
import { SkillsModule } from '@hephaestus/skills';
import { ToolsModule } from '@hephaestus/tools';

import { AgentBudgetController } from './agent-budget.controller.js';
import { AgentModelKeysController } from './agent-model-keys.controller.js';
import { AgentVersionChecks } from './agent-version-checks.js';
import { AgentVersionChecksController } from './agent-version-checks.controller.js';
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
    TenancyModule,
    ModelsModule,
    ToolsModule,
    SkillsModule,
  ],
  controllers: [
    AgentsController,
    AgentVersionsController,
    AgentModelKeysController,
    AgentBudgetController,
    AgentVersionChecksController,
  ],
  providers: [
    AgentsService,
    AgentMapper,
    AgentVersionsService,
    AgentVersionMapper,
    AgentVersionChecks,
  ],
  exports: [AgentsService, AgentVersionsService],
})
export class AgentsModule {}
