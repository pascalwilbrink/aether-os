import { DataSource } from 'typeorm';
import type { TestProject } from 'vitest/node';

import {
  InboxMessageEntity,
  OutboxMessageEntity,
  postgresOptions,
} from '@aether-os/krepis';
import {
  startTestPostgres,
  startTestRabbitMq,
} from '@aether-os/krepis/testing';

import { AgentVersionEntity } from '../libs/agents/src/agent-version.entity.js';
import { AgentEntity } from '../libs/agents/src/agent.entity.js';
import { OrganizationStateEntity } from '../libs/tenancy/src/organization-state.entity.js';
import { ProjectStateEntity } from '../libs/tenancy/src/project-state.entity.js';
import { ArtifactEntity } from '../libs/artifacts/src/artifact.entity.js';
import { TaskTemplateVersionEntity } from '../libs/templates/src/task-template-version.entity.js';
import { TaskTemplateEntity } from '../libs/templates/src/task-template.entity.js';
import { ModelCallEntity } from '../libs/models/src/model-call.entity.js';
import { ModelEntity } from '../libs/models/src/model.entity.js';
import { ModelPriceEntity } from '../libs/models/src/model-price.entity.js';
import { BudgetEntity } from '../libs/models/src/budget.entity.js';
import { ModelKeyEntity } from '../libs/models/src/model-key.entity.js';
import { ToolServerEntity } from '../libs/tools/src/tool-server.entity.js';
import { ExecutionEntity } from '../libs/runner/src/execution.entity.js';
import { TaskEntity } from '../libs/tasks/src/task.entity.js';
import { WorkspaceEntity } from '../libs/workspaces/src/workspace.entity.js';
import { migrations } from '../src/database/migrations/index.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
    rabbitmqUrl: string;
  }
}

/**
 * Starts Postgres, applies the migrations (tests run against the migrated
 * schema, never a synchronized one) and fails if the entities no longer match
 * it, i.e. a migration is missing.
 */
export default async function setup(project: TestProject) {
  const [postgres, rabbitmq] = await Promise.all([
    startTestPostgres(),
    startTestRabbitMq(),
  ]);
  const dataSource = new DataSource(
    postgresOptions({
      url: postgres.url,
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
        ArtifactEntity,
        TaskTemplateEntity,
        TaskTemplateVersionEntity,
      ],
    }),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const pending = await dataSource.driver.createSchemaBuilder().log();
  await seedTestModels(dataSource);
  await dataSource.destroy();
  if (pending.upQueries.length > 0) {
    await Promise.all([postgres.stop(), rabbitmq.stop()]);
    throw new Error(
      'The entities differ from the migrated schema; generate a migration:\n' +
        pending.upQueries.map((query) => `  ${query.query}`).join('\n'),
    );
  }

  project.provide('databaseUrl', postgres.url);
  project.provide('rabbitmqUrl', rabbitmq.url);

  return async () => {
    await Promise.all([postgres.stop(), rabbitmq.stop()]);
  };
}

/**
 * The models the tests' agent versions name, in the catalogue for the whole
 * run (tests don't empty it): `anthropic/claude`, and `scripted/scripted-model`
 * (`test/fake-models.ts`) with a price, so metered calls have a cost.
 */
async function seedTestModels(dataSource: DataSource): Promise<void> {
  for (const [provider, model, price] of [
    ['anthropic', 'claude', null],
    ['scripted', 'scripted-model', ['3', '15', '0.3', '3.75']],
  ] as const) {
    const [{ id }] = (await dataSource.query(
      `INSERT INTO models (id, provider, model, name, status, version, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $2, 'active', 1, 'test', now(), now()) RETURNING id`,
      [provider, model],
    )) as { id: string }[];
    if (price) {
      await dataSource.query(
        `INSERT INTO model_prices (id, model_id, effective_from, input_per_m_tok, output_per_m_tok, cache_read_per_m_tok, cache_write_per_m_tok, created_by, created_at)
         VALUES (gen_random_uuid(), $1, '2000-01-01', $2, $3, $4, $5, 'test', now())`,
        [id, ...price],
      );
    }
  }
}
