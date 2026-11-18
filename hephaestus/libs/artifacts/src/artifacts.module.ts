import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TasksModule } from '@hephaestus/tasks';

import { ArtifactEntity } from './artifact.entity.js';
import { ArtifactMapper } from './artifact.mapper.js';
import { ArtifactsController } from './artifacts.controller.js';
import { ArtifactsService } from './artifacts.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ArtifactEntity]), TasksModule],
  controllers: [ArtifactsController],
  providers: [ArtifactsService, ArtifactMapper],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
