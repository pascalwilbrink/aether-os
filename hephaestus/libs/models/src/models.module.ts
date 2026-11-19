import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  OpenBaoSecretStore,
  SecretStore,
  UnconfiguredSecretStore,
  type Env,
} from '@hephaestus/core';

import { LanguageModels, MastraModelRouter } from './language-models.js';
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
  ],
  controllers: [ModelsController, BudgetsController, ModelKeysController],
  providers: [
    {
      provide: SecretStore,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const address = config.get('OPENBAO_ADDR', { infer: true });
        const token = config.get('OPENBAO_TOKEN', { infer: true });
        return address && token
          ? new OpenBaoSecretStore({
              address,
              token,
              mount: config.get('OPENBAO_KV_MOUNT', { infer: true }),
            })
          : new UnconfiguredSecretStore();
      },
    },
    { provide: LanguageModels, useClass: MastraModelRouter },
    ModelMapper,
    ModelCatalogService,
    ModelGateway,
    BudgetMapper,
    BudgetsService,
    ModelKeyMapper,
    ModelKeysService,
  ],
  exports: [
    ModelGateway,
    ModelCatalogService,
    BudgetsService,
    ModelKeysService,
  ],
})
export class ModelsModule {}
