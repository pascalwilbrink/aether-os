import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CatalogModule } from '@pylon/catalog';
import type { Env } from '@pylon/core';
import { KeysModule } from '@pylon/keys';
import { UsageModule } from '@pylon/usage';

import { EmbeddingsController } from './embeddings.controller.js';
import { EmbeddingsService } from './embeddings.service.js';
import { ModelGateway } from './model-gateway.js';
import { PassThroughService, PROVIDER_URLS } from './pass-through.service.js';
import type { ProviderUrls } from './provider-apis.js';
import {
  PROVIDER_CLIENT_OPTIONS,
  ProviderClient,
  type ProviderClientOptions,
} from './provider-client.js';
import { ProviderKeyHeaders } from './provider-key-headers.middleware.js';
import { ProvidersController } from './providers.controller.js';

/** Model calls (passed through) and embeddings (docs/pylon.md). */
@Module({
  imports: [CatalogModule, KeysModule, UsageModule],
  controllers: [ProvidersController, EmbeddingsController],
  providers: [
    ModelGateway,
    PassThroughService,
    EmbeddingsService,
    ProviderClient,
    {
      provide: PROVIDER_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<Env, true>,
      ): ProviderClientOptions => ({
        retries: config.get('PROVIDER_RETRIES', { infer: true }),
        timeoutMs: config.get('PROVIDER_TIMEOUT_MS', { infer: true }),
        allowPrivate: config.get('MODEL_ENDPOINT_ALLOW_PRIVATE', {
          infer: true,
        }),
      }),
    },
    {
      provide: PROVIDER_URLS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ProviderUrls => ({
        anthropic: config.get('ANTHROPIC_API_URL', { infer: true }),
        openai: config.get('OPENAI_API_URL', { infer: true }),
        mistral: config.get('MISTRAL_API_URL', { infer: true }),
        google: config.get('GOOGLE_API_URL', { infer: true }),
      }),
    },
  ],
})
export class GatewayModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(ProviderKeyHeaders)
      .forRoutes({ path: 'providers/*path', method: RequestMethod.POST });
  }
}
