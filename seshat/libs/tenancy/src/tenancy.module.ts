import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ClientCredentialsServiceTokens,
  ServiceTokens,
  type Env,
} from '@seshat/core';

import {
  HttpPolisClient,
  POLIS_CLIENT_OPTIONS,
  type PolisClientOptions,
} from './http-polis.client.js';
import { PolisClient } from './polis-client.js';
import { ProjectDepartmentEntity } from './project-department.entity.js';
import { TenancyService } from './tenancy.service.js';

/**
 * Organizations, projects and departments, from Polis with Seshat's own
 * token; the department of each project, from Polis's events.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ProjectDepartmentEntity])],
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
          // model:invoke only with Pylon (embeddings): a client that
          // isn't given it would otherwise get no token at all.
          scope: config.get('PYLON_URL', { infer: true })
            ? 'platform:read model:invoke'
            : 'platform:read',
        }),
    },
    { provide: PolisClient, useClass: HttpPolisClient },
  ],
  exports: [TenancyService, ServiceTokens],
})
export class TenancyModule {}
