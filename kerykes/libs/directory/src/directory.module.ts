import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  ClientCredentialsServiceTokens,
  ServiceTokens,
  type Env,
} from '@kerykes/core';

import { Directory } from './directory.js';
import {
  DIRECTORY_OPTIONS,
  HttpDirectory,
  type DirectoryOptions,
} from './http-directory.js';

/** Memberships, projects and persons from Polis, users from Pistis, work's assignees from Ergon, with Kerykes's own token. */
@Module({
  providers: [
    {
      provide: DIRECTORY_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): DirectoryOptions => ({
        polisUrl: config.get('POLIS_URL', { infer: true }),
        ergonUrl: config.get('ERGON_URL', { infer: true }),
        pistisUrl:
          config.get('PISTIS_URL', { infer: true }) ??
          new URL(config.get('PISTIS_ISSUER', { infer: true })).origin,
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
    { provide: Directory, useClass: HttpDirectory },
  ],
  exports: [Directory],
})
export class DirectoryModule {}
