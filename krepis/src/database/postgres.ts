import type { DataSourceOptions } from 'typeorm';

import { SnakeNamingStrategy } from './snake-naming.strategy.js';

export interface PostgresOptions {
  url: string;
  /** Migration classes, in order; run with `pnpm migration:run`, never at startup. */
  migrations?: DataSourceOptions['migrations'];
  /** Entity classes; leave out in Nest apps, which use `autoLoadEntities`. */
  entities?: DataSourceOptions['entities'];
}

/**
 * Connection options every service uses for its own Postgres database
 * (docs/engineering.md): `snake_case` names, `synchronize` off (the schema
 * only changes through migrations), and migrations never run implicitly.
 */
export function postgresOptions(options: PostgresOptions): DataSourceOptions {
  return {
    type: 'postgres',
    url: options.url,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
    migrations: options.migrations ?? [],
    entities: options.entities ?? [],
  };
}
