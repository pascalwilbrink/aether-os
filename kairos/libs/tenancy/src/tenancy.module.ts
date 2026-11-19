import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ClientCredentialsServiceTokens,
  ServiceTokens,
  type Env,
} from '@kairos/core';

import {
  HttpPolisClient,
  POLIS_CLIENT_OPTIONS,
  type PolisClientOptions,
} from './http-polis.client.js';
import { PolisClient } from './polis-client.js';
import { TenancyService } from './tenancy.service.js';

/** Organizations and projects, from Polis with Kairos's own token. */
@Module({
  providers: [
    TenancyService,
    {
      provide: POLIS_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PolisClientOptions => ({
        baseUrl: config.get('POLIS_URL', { infer: true }),
      }),
    },
    {
      provide: ServiceTokens,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new ClientCredentialsServiceTokens({
          issuer: config.get('PISTIS_ISSUER', { infer: true }),
          clientId: config.get('PISTIS_CLIENT_ID', { infer: true }),
          clientSecret: config.get('PISTIS_CLIENT_SECRET', { infer: true }),
          scope: 'platform:read',
        }),
    },
    { provide: PolisClient, useClass: HttpPolisClient },
  ],
  exports: [TenancyService],
})
export class TenancyModule {}
