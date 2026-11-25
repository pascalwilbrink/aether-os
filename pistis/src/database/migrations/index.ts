import { Initial1794756941850 } from './1794756941850-Initial.js';
import { PasswordsAndOidc1794758219471 } from './1794758219471-PasswordsAndOidc.js';
import { ServiceAccounts1794780947702 } from './1794780947702-ServiceAccounts.js';
import { Outbox1795560000000 } from './1795560000000-Outbox.js';
import { UserVersions1795610000000 } from './1795610000000-UserVersions.js';

/**
 * Every migration, oldest first. Generate one with
 * `pnpm build && pnpm migration:generate src/database/migrations/<Name>`,
 * review it, and add it here. Migrations must stay compatible with the
 * previous release (expand, then contract): there are no down migrations.
 */
export const migrations = [
  Initial1794756941850,
  PasswordsAndOidc1794758219471,
  ServiceAccounts1794780947702,
  Outbox1795560000000,
  UserVersions1795610000000,
];
