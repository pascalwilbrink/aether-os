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
import { SkillVersionEntity } from '../libs/skills/src/skill-version.entity.js';
import { SkillEntity } from '../libs/skills/src/skill.entity.js';
import { ToolServerEntity } from '../libs/tools/src/tool-server.entity.js';
import { ExecutionEntity } from '../libs/runner/src/execution.entity.js';
import { ExecutionEventEntity } from '../libs/runner/src/execution-event.entity.js';
import { CouncilVersionEntity } from '../libs/councils/src/council-version.entity.js';
import { CouncilEntity } from '../libs/councils/src/council.entity.js';
import { SessionMessageEntity } from '../libs/sessions/src/session-message.entity.js';
import { DeliberationRoundEntity } from '../libs/sessions/src/deliberation-round.entity.js';
import { CouncilPlanEntity } from '../libs/sessions/src/council-plan.entity.js';
import { SessionEntity } from '../libs/sessions/src/session.entity.js';
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
        ExecutionEventEntity,
        ToolServerEntity,
        SkillEntity,
        SkillVersionEntity,
        ArtifactEntity,
        TaskTemplateEntity,
        TaskTemplateVersionEntity,
        CouncilEntity,
        CouncilVersionEntity,
        SessionEntity,
        SessionMessageEntity,
        DeliberationRoundEntity,
        CouncilPlanEntity,
      ],
    }),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const pending = await dataSource.driver.createSchemaBuilder().log();
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
