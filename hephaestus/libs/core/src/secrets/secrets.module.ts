import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  OpenBaoSecretStore,
  SecretStore,
  UnconfiguredSecretStore,
} from '@aether-os/krepis';

import type { Env } from '../config/env.js';

/**
 * OpenBao (../CLAUDE.md, secrets): model provider keys and tool server
 * credentials. Without `OPENBAO_ADDR` and `OPENBAO_TOKEN`, nothing can be
 * stored or read, which is logged once at startup.
 */
@Module({
  providers: [
    {
      provide: SecretStore,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const address = config.get('OPENBAO_ADDR', { infer: true });
        const token = config.get('OPENBAO_TOKEN', { infer: true });
        if (address && token) {
          return new OpenBaoSecretStore({
            address,
            token,
            mount: config.get('OPENBAO_KV_MOUNT', { infer: true }),
          });
        }
        new Logger('SecretStore').warn(
          'OpenBao is not configured (OPENBAO_ADDR, OPENBAO_TOKEN): model keys and tool server credentials can be neither stored nor read',
        );
        return new UnconfiguredSecretStore();
      },
    },
  ],
  exports: [SecretStore],
})
export class SecretsModule {}
