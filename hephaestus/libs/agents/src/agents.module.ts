import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionModule } from '@hephaestus/core';
import { OrganizationsModule } from '@hephaestus/organizations';

import { AgentService } from './application/service/agent.service.js';
import { AgentVersionRepository } from './domain/repository/agent-version.repository.js';
import { AgentRepository } from './domain/repository/agent.repository.js';
import { AgentVersionEntity } from './infrastructure/persistence/entity/agent-version.entity.js';
import { AgentEntity } from './infrastructure/persistence/entity/agent.entity.js';
import { AgentVersionMapper } from './infrastructure/persistence/mapper/agent-version.mapper.js';
import { AgentMapper } from './infrastructure/persistence/mapper/agent.mapper.js';
import { TypeOrmAgentVersionRepository } from './infrastructure/persistence/repository/typeorm-agent-version.repository.js';
import { TypeOrmAgentRepository } from './infrastructure/persistence/repository/typeorm-agent.repository.js';
import { AgentVersionsController } from './presentation/http/agent-versions.controller.js';
import { AgentsController } from './presentation/http/agents.controller.js';

@Module({
  imports: [
    // Registers the entities with autoLoadEntities; repositories resolve
    // them through TypeOrmTransactionManager.
    TypeOrmModule.forFeature([AgentEntity, AgentVersionEntity]),
    TransactionModule,
    OrganizationsModule,
  ],
  controllers: [AgentsController, AgentVersionsController],
  providers: [
    AgentService,
    AgentMapper,
    AgentVersionMapper,
    { provide: AgentRepository, useClass: TypeOrmAgentRepository },
    {
      provide: AgentVersionRepository,
      useClass: TypeOrmAgentVersionRepository,
    },
  ],
  exports: [AgentService],
})
export class AgentsModule {}
