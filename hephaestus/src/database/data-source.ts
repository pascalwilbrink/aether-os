import 'reflect-metadata';

import { DataSource } from 'typeorm';

import {
  InboxMessageEntity,
  OutboxMessageEntity,
  postgresOptions,
} from '@aether-os/krepis';

import { AgentVersionEntity } from '../../libs/agents/src/agent-version.entity.js';
import { AgentEntity } from '../../libs/agents/src/agent.entity.js';
import { OrganizationStateEntity } from '../../libs/tenancy/src/organization-state.entity.js';
import { ProjectStateEntity } from '../../libs/tenancy/src/project-state.entity.js';
import { ArtifactEntity } from '../../libs/artifacts/src/artifact.entity.js';
import { TaskTemplateVersionEntity } from '../../libs/templates/src/task-template-version.entity.js';
import { TaskTemplateEntity } from '../../libs/templates/src/task-template.entity.js';
import { ModelCallEntity } from '../../libs/models/src/model-call.entity.js';
import { ModelEntity } from '../../libs/models/src/model.entity.js';
import { ModelPriceEntity } from '../../libs/models/src/model-price.entity.js';
import { BudgetEntity } from '../../libs/models/src/budget.entity.js';
import { SkillVersionEntity } from '../../libs/skills/src/skill-version.entity.js';
import { SkillEntity } from '../../libs/skills/src/skill.entity.js';
import { ToolServerEntity } from '../../libs/tools/src/tool-server.entity.js';
import { ModelKeyEntity } from '../../libs/models/src/model-key.entity.js';
import { ExecutionEntity } from '../../libs/runner/src/execution.entity.js';
import { TaskEntity } from '../../libs/tasks/src/task.entity.js';
import { WorkspaceEntity } from '../../libs/workspaces/src/workspace.entity.js';
import { migrations } from './migrations/index.js';

/**
 * The data source the TypeORM CLI uses (`pnpm migration:run`,
 * `pnpm migration:generate`), on the compiled output in dist/. Entities are
 * listed here because the CLI doesn't run Nest's `autoLoadEntities`.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file: the environment is used as is.
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set (see .env.example)');
}

export default new DataSource(
  postgresOptions({
    url,
    migrations,
    entities: [
      OrganizationStateEntity,
      ProjectStateEntity,
      InboxMessageEntity,
      OutboxMessageEntity,
      AgentEntity,
      AgentVersionEntity,
      WorkspaceEntity,
      TaskEntity,
      ExecutionEntity,
      ModelCallEntity,
      ModelEntity,
      ModelPriceEntity,
      BudgetEntity,
      ModelKeyEntity,
      ToolServerEntity,
      SkillEntity,
      SkillVersionEntity,
      ArtifactEntity,
      TaskTemplateEntity,
      TaskTemplateVersionEntity,
    ],
  }),
);
