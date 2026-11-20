import 'reflect-metadata';

import pg from 'pg';

/**
 * Copies the agents and agent versions Hephaestus held before Agora existed
 * into Agora's database, with the same IDs (tasks pin version IDs), once:
 * rows Agora already has are left alone, so running it again is harmless.
 * No events are published: Hephaestus has these already.
 *
 *   HEPHAESTUS_DATABASE_URL=postgres://aether:aether@localhost:5432/hephaestus \
 *     pnpm import:hephaestus
 *
 * Agora's own database is `DATABASE_URL` (from `.env`); run its migrations
 * first.
 */
try {
  process.loadEnvFile();
} catch {
  // No .env file: the environment is used as is.
}

const from = process.env.HEPHAESTUS_DATABASE_URL;
const to = process.env.DATABASE_URL;
if (!from || !to) {
  throw new Error('Set HEPHAESTUS_DATABASE_URL and DATABASE_URL');
}

const source = new pg.Client({ connectionString: from });
const target = new pg.Client({ connectionString: to });
await source.connect();
await target.connect();
try {
  const agents = await source.query(
    `SELECT id, organization_id, name, description, status, latest_version_id,
            created_by, created_at, updated_at
       FROM agents ORDER BY created_at, id`,
  );
  const versions = await source.query(
    `SELECT id, agent_id, organization_id, version, status, instructions, model,
            capabilities, tools, skills, runtime, created_by, created_at, published_at
       FROM agent_versions ORDER BY agent_id, version`,
  );

  await target.query('BEGIN');
  let agentsAdded = 0;
  for (const row of agents.rows) {
    const result = await target.query(
      `INSERT INTO agents (id, organization_id, name, description, status,
                           latest_version_id, version, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.organization_id,
        row.name,
        row.description,
        row.status,
        row.latest_version_id,
        row.created_by,
        row.created_at,
        row.updated_at,
      ],
    );
    agentsAdded += result.rowCount ?? 0;
  }
  let versionsAdded = 0;
  for (const row of versions.rows) {
    const result = await target.query(
      `INSERT INTO agent_versions (id, agent_id, organization_id, version, status,
                                   instructions, model, capabilities, tools, skills,
                                   runtime, created_by, created_at, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        row.agent_id,
        row.organization_id,
        row.version,
        row.status,
        row.instructions,
        JSON.stringify(row.model),
        JSON.stringify(row.capabilities),
        JSON.stringify(row.tools),
        JSON.stringify(row.skills),
        JSON.stringify(row.runtime),
        row.created_by,
        row.created_at,
        row.published_at,
      ],
    );
    versionsAdded += result.rowCount ?? 0;
  }
  await target.query('COMMIT');
  console.log(
    `Imported ${agentsAdded} of ${agents.rowCount} agents and ${versionsAdded} of ${versions.rowCount} versions from Hephaestus.`,
  );
} catch (error) {
  await target.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await Promise.all([source.end(), target.end()]);
}
