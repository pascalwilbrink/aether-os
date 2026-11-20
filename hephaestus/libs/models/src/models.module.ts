import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigService } from '@nestjs/config';

import { SecretsModule, type Env } from '@hephaestus/core';

import { LanguageModels, MastraModelRouter } from './language-models.js';
import { HttpPylonModels, PylonModels } from './pylon-models.js';
import { TenancyModule } from '@hephaestus/tenancy';

import { BudgetEntity } from './budget.entity.js';
import { BudgetMapper } from './budget.mapper.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';
import { ModelCallEntity } from './model-call.entity.js';
import { ModelKeyEntity } from './model-key.entity.js';
import { ModelKeyMapper } from './model-key.mapper.js';
import { ModelKeysController } from './model-keys.controller.js';
import { ModelKeysService } from './model-keys.service.js';
import { ModelCatalogService } from './model-catalog.service.js';
import { ModelGateway } from './model-gateway.js';
import { ModelPriceEntity } from './model-price.entity.js';
import { ModelEntity } from './model.entity.js';
import { ModelMapper } from './model.mapper.js';
import { ModelsController } from './models.controller.js';
import { OllamaModelsController } from './ollama-models.controller.js';
import { OllamaModelsService } from './ollama-models.service.js';

/** The model catalogue, the gateway, OpenBao, metering and budgets (docs/models.md). */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ModelCallEntity,
      ModelEntity,
      ModelPriceEntity,
      BudgetEntity,
      ModelKeyEntity,
    ]),
    TenancyModule,
    SecretsModule,
  ],
  controllers: [
    ModelsController,
    BudgetsController,
    ModelKeysController,
    OllamaModelsController,
  ],
  providers: [
    {
      provide: LanguageModels,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new MastraModelRouter({
          allowPrivate: config.get('MODEL_ENDPOINT_ALLOW_PRIVATE', {
            infer: true,
          }),
        }),
    },
    {
      // Through Pylon with USE_PYLON (../docs/pylon.md); else the gateway
      // calls providers itself.
      provide: PylonModels,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const url = config.get('PYLON_URL', { infer: true });
        return config.get('USE_PYLON', { infer: true }) && url
          ? new HttpPylonModels(url)
          : null;
      },
    },
    ModelMapper,
    ModelCatalogService,
    ModelGateway,
    BudgetMapper,
    BudgetsService,
    ModelKeyMapper,
    ModelKeysService,
    OllamaModelsService,
  ],
  exports: [
    ModelGateway,
    ModelCatalogService,
    BudgetsService,
    ModelKeysService,
  ],
})
export class ModelsModule {}
