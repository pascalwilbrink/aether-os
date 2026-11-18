import { Initial1794741066659 } from './1794741066659-Initial.js';
import { Memberships1794743007032 } from './1794743007032-Memberships.js';
import { Outbox1794744119144 } from './1794744119144-Outbox.js';
import { MembershipsBySubjectType1795000000000 } from './1795000000000-MembershipsBySubjectType.js';
import { ProjectMemberships1794766125332 } from './1794766125332-ProjectMemberships.js';

/**
 * Every migration, oldest first. Generate one with
 * `pnpm build && pnpm migration:generate src/database/migrations/<Name>`,
 * review it, and add it here. Migrations must stay compatible with the
 * previous release (expand, then contract): there are no down migrations.
 */
export const migrations = [
  Initial1794741066659,
  Memberships1794743007032,
  Outbox1794744119144,
  ProjectMemberships1794766125332,
  MembershipsBySubjectType1795000000000,
];
