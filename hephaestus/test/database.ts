import type { INestApplicationContext } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Empties every table, so each test starts from a clean database. */
export async function resetDatabase(
  app: INestApplicationContext,
): Promise<void> {
  await app
    .get(DataSource)
    .query(
      'TRUNCATE organization_states, project_states, inbox, outbox, agents, agent_versions, councils, council_versions, workspaces, tasks, executions, execution_events, tool_servers, skills, skill_versions, artifacts, task_templates, task_template_versions, sessions, session_messages',
    );
}
