import { Initial1794746266946 } from './1794746266946-Initial.js';
import { Tenancy1794755705357 } from './1794755705357-Tenancy.js';
import { Tasks1794781888697 } from './1794781888697-Tasks.js';
import { Executions1794997258610 } from './1794997258610-Executions.js';
import { ModelCalls1794998423374 } from './1794998423374-ModelCalls.js';
import { WorkspaceWithoutRepository1795001165465 } from './1795001165465-WorkspaceWithoutRepository.js';
import { Artifacts1795002247274 } from './1795002247274-Artifacts.js';
import { Reviews1795003890137 } from './1795003890137-Reviews.js';
import { Verification1795005075662 } from './1795005075662-Verification.js';
import { TaskTemplates1795006479486 } from './1795006479486-TaskTemplates.js';
import { Repositories1795025797701 } from './1795025797701-Repositories.js';
import { PullRequestArtifacts1795030000000 } from './1795030000000-PullRequestArtifacts.js';
import { Deliveries1795031000000 } from './1795031000000-Deliveries.js';

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
  WorkspaceWithoutRepository1795001165465,
  Artifacts1795002247274,
  Reviews1795003890137,
  Verification1795005075662,
  TaskTemplates1795006479486,
  Repositories1795025797701,
  PullRequestArtifacts1795030000000,
  Deliveries1795031000000,
];
