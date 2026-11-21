import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@agora/agents';
import { TenancyModule } from '@agora/tenancy';

import { CouncilVersionEntity } from './council-version.entity.js';
import { CouncilVersionsService } from './council-versions.service.js';
import { CouncilEntity } from './council.entity.js';
import { CouncilMapper } from './council.mapper.js';
import { CouncilsController } from './councils.controller.js';
import { CouncilsService } from './councils.service.js';

/** Councils and their versions; their agents are checked against `AgentsService`. */
@Module({
  imports: [
    TypeOrmModule.forFeature([CouncilEntity, CouncilVersionEntity]),
    TenancyModule,
    AgentsModule,
  ],
  controllers: [CouncilsController],
  providers: [CouncilsService, CouncilVersionsService, CouncilMapper],
  exports: [CouncilsService, CouncilVersionsService],
})
export class CouncilsModule {}
