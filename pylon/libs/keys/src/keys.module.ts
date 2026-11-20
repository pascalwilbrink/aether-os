import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentsModule } from '@pylon/agents';
import { SecretsModule } from '@pylon/core';
import { TenancyModule } from '@pylon/tenancy';

import { AgentModelKeysController } from './agent-model-keys.controller.js';
import { ModelKeyEntity } from './model-key.entity.js';
import { ModelKeyMapper } from './model-key.mapper.js';
import { ModelKeysController } from './model-keys.controller.js';
import { ModelKeysService } from './model-keys.service.js';
import { OllamaModelsController } from './ollama-models.controller.js';
import { OllamaModelsService } from './ollama-models.service.js';
import { ProviderKeys } from './provider-keys.js';

/** Provider keys (docs/models.md, Keys): set in OpenBao, picked per call. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ModelKeyEntity]),
    SecretsModule,
    TenancyModule,
    AgentsModule,
  ],
  controllers: [
    ModelKeysController,
    AgentModelKeysController,
    OllamaModelsController,
  ],
  providers: [
    ModelKeyMapper,
    ModelKeysService,
    OllamaModelsService,
    ProviderKeys,
  ],
  exports: [ProviderKeys],
})
export class KeysModule {}
