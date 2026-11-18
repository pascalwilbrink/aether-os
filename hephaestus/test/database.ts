import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Empties every table, so each test starts from a clean database. */
export async function resetDatabase(
  app: INestApplicationContext,
): Promise<void> {
  await app
    .get(DataSource)
    .query(
      'TRUNCATE organization_states, project_states, inbox, outbox, agents, agent_versions, workspaces, tasks, executions, model_calls, artifacts, task_templates, task_template_versions',
    );
}
