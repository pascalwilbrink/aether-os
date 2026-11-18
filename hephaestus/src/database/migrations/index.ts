import { Initial1794746266946 } from './1794746266946-Initial.js';
import { Tenancy1794755705357 } from './1794755705357-Tenancy.js';
import { Tasks1794781888697 } from './1794781888697-Tasks.js';
import { Executions1794997258610 } from './1794997258610-Executions.js';
import { ModelCalls1794998423374 } from './1794998423374-ModelCalls.js';

/**
 * Every migration, oldest first. Generate one with
 * `pnpm build && pnpm migration:generate src/database/migrations/<Name>`,
 * review it, and add it here. Migrations must stay compatible with the
 * previous release (expand, then contract): there are no down migrations.
 */
export const migrations = [
  Initial1794746266946,
  Tenancy1794755705357,
  Tasks1794781888697,
  Executions1794997258610,
  ModelCalls1794998423374,
];
