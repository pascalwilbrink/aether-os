import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CouncilVersionEntity } from './council-version.entity.js';
import { CouncilVersionsService } from './council-versions.service.js';
import { CouncilEntity } from './council.entity.js';
import { CouncilsService } from './councils.service.js';

/** Hephaestus's copy of Agora's councils and published versions (from `agora.events`). */
@Module({
  imports: [TypeOrmModule.forFeature([CouncilEntity, CouncilVersionEntity])],
  providers: [CouncilsService, CouncilVersionsService],
  exports: [CouncilsService],
})
export class CouncilsModule {}
