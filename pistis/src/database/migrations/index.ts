import { Initial1794756941850 } from './1794756941850-Initial.js';
import { PasswordsAndOidc1794758219471 } from './1794758219471-PasswordsAndOidc.js';

/**
 * Every migration, oldest first. Generate one with
 * `pnpm build && pnpm migration:generate src/database/migrations/<Name>`,
 * review it, and add it here. Migrations must stay compatible with the
 * previous release (expand, then contract): there are no down migrations.
 */
export const migrations = [Initial1794756941850, PasswordsAndOidc1794758219471];
