import { Initial1794741066659 } from './1794741066659-Initial.js';
import { Memberships1794743007032 } from './1794743007032-Memberships.js';

/**
 * Every migration, oldest first. Generate one with
 * `pnpm build && pnpm migration:generate src/database/migrations/<Name>`,
 * review it, and add it here. Migrations must stay compatible with the
 * previous release (expand, then contract): there are no down migrations.
 */
export const migrations = [Initial1794741066659, Memberships1794743007032];
