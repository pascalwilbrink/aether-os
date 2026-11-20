import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ModelCatalogService } from './model-catalog.service.js';
import { ModelPriceEntity } from './model-price.entity.js';
import { ModelEntity } from './model.entity.js';
import { ModelMapper } from './model.mapper.js';
import { ModelsController } from './models.controller.js';

/** The model catalogue: models and their versioned prices (docs/models.md, Models). */
@Module({
  imports: [TypeOrmModule.forFeature([ModelEntity, ModelPriceEntity])],
  controllers: [ModelsController],
  providers: [ModelMapper, ModelCatalogService],
  exports: [ModelCatalogService],
})
export class CatalogModule {}
