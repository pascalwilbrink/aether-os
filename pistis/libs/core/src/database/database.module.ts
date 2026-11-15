import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import {
  createTransactionalDataSource,
  postgresOptions,
} from '@aether-os/krepis';

import type { Env } from '../config/env.js';

/**
 * Pistis's Postgres connection. The schema only changes through migrations
 * (`pnpm migration:run`, a separate step before the app starts), never at
 * startup. `@Transactional()` service methods use this data source.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        ...postgresOptions({
          url: config.get('DATABASE_URL', { infer: true }),
        }),
        autoLoadEntities: true,
      }),
      dataSourceFactory: async (options) => {
        if (!options) {
          throw new Error('Database options are missing');
        }
        return createTransactionalDataSource(options);
      },
    }),
  ],
})
export class DatabaseModule {}
