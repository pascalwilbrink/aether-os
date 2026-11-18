import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  OpenBaoSecretStore,
  SecretStore,
  UnconfiguredSecretStore,
  type Env,
} from '@proxenos/core';

import { GitHubApp } from './github-app.js';
import { HttpGitHubApp } from './http-github-app.js';

/** The GitHub App, with its secrets from OpenBao. */
@Module({
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
    {
      provide: GitHubApp,
      inject: [ConfigService, SecretStore],
      useFactory: (config: ConfigService<Env, true>, store: SecretStore) =>
        new HttpGitHubApp(
          {
            appId: config.get('GITHUB_APP_ID', { infer: true }),
            slug: config.get('GITHUB_APP_SLUG', { infer: true }),
            clientId: config.get('GITHUB_CLIENT_ID', { infer: true }),
            webUrl: config.get('GITHUB_URL', { infer: true }),
            apiUrl: config.get('GITHUB_API_URL', { infer: true }),
            secretPath: config.get('GITHUB_APP_SECRET_PATH', { infer: true }),
          },
          store,
        ),
    },
  ],
  exports: [GitHubApp],
})
export class GitHubModule {}
