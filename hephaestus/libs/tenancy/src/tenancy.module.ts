import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  ClientCredentialsServiceTokens,
  ServiceTokens,
  type Env,
} from '@hephaestus/core';

import {
  HttpPolisClient,
  POLIS_CLIENT_OPTIONS,
  type PolisClientOptions,
} from './http-polis.client.js';
import { OrganizationStateEntity } from './organization-state.entity.js';
import { OrganizationsService } from './organizations.service.js';
import { PolisClient } from './polis-client.js';
import { ProjectStateEntity } from './project-state.entity.js';
import { ProjectsService } from './projects.service.js';

/**
 * Organizations and projects, owned by Polis: their status, kept from
 * Polis's events (Krepis's `EventsModule` subscription in the app module)
 * and fetched from Polis's API on a miss.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationStateEntity, ProjectStateEntity]),
  ],
  providers: [
    OrganizationsService,
    ProjectsService,
    {
      provide: POLIS_CLIENT_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PolisClientOptions => ({
        baseUrl: config.get('POLIS_URL', { infer: true }),
      }),
    },
    {
      // Hephaestus's own token from Pistis, for Polis's platform reads.
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
  exports: [OrganizationsService, ProjectsService],
})
export class TenancyModule {}
