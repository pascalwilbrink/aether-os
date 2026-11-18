import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TasksModule } from '@hephaestus/tasks';
import { TenancyModule } from '@hephaestus/tenancy';

import { ArtifactEntity } from './artifact.entity.js';
import { ArtifactMapper } from './artifact.mapper.js';
import { ArtifactsController } from './artifacts.controller.js';
import { ArtifactsService } from './artifacts.service.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ArtifactEntity]),
    TasksModule,
    TenancyModule,
  ],
  controllers: [ArtifactsController],
  providers: [ArtifactsService, ReviewsService, ArtifactMapper],
  exports: [ArtifactsService],
})
export class ArtifactsModule {}
