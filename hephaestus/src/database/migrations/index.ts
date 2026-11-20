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
import { ModelCatalog1795038150208 } from './1795038150208-ModelCatalog.js';
import { ModelCatalogSeed1795038150209 } from './1795038150209-ModelCatalogSeed.js';
import { Budgets1795041939868 } from './1795041939868-Budgets.js';
import { ModelKeys1795045800295 } from './1795045800295-ModelKeys.js';
import { AgentBudgets1795070345258 } from './1795070345258-AgentBudgets.js';
import { TaskConcurrency1795082757713 } from './1795082757713-TaskConcurrency.js';
import { OllamaModelKeys1795130000000 } from './1795130000000-OllamaModelKeys.js';
import { OpenAiModelsSeed1795130000001 } from './1795130000001-OpenAiModelsSeed.js';
import { FileArtifacts1795140000000 } from './1795140000000-FileArtifacts.js';
import { TaskInputFiles1795150000000 } from './1795150000000-TaskInputFiles.js';
import { ExecutionEvents1795165184112 } from './1795165184112-ExecutionEvents.js';
import { ExecutionTraces1795120000000 } from './1795120000000-ExecutionTraces.js';
import { Skills1795110000000 } from './1795110000000-Skills.js';
import { ToolServers1795100000000 } from './1795100000000-ToolServers.js';
import { WorkspaceBlockedHosts1795085475839 } from './1795085475839-WorkspaceBlockedHosts.js';

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
  ModelCatalog1795038150208,
  ModelCatalogSeed1795038150209,
  Budgets1795041939868,
  ModelKeys1795045800295,
  AgentBudgets1795070345258,
  TaskConcurrency1795082757713,
  WorkspaceBlockedHosts1795085475839,
  ToolServers1795100000000,
  Skills1795110000000,
  ExecutionTraces1795120000000,
  OllamaModelKeys1795130000000,
  OpenAiModelsSeed1795130000001,
  FileArtifacts1795140000000,
  TaskInputFiles1795150000000,
  ExecutionEvents1795165184112,
];
