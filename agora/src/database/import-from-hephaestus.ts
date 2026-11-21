import 'reflect-metadata';

import pg from 'pg';

/**
 * Copies the agents and agent versions, and the skills and skill versions,
 * Hephaestus held before Agora owned them into Agora's database, with the
 * same IDs (tasks pin version IDs), once: rows Agora already has are left
 * alone, so running it again is harmless. No events are published:
 * Hephaestus has these already. Agents start at `version` 1 and skills at
 * `revision` 1, as Hephaestus's copy of them does, so the next event about
 * one is newer than what it has.
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
  const skills = await importSkills(source, target);
  await target.query('COMMIT');
  console.log(
    `Imported ${agentsAdded} of ${agents.rowCount} agents and ${versionsAdded} of ${versions.rowCount} versions from Hephaestus.`,
  );
  console.log(
    `Imported ${skills.skillsAdded} of ${skills.skills} skills and ${skills.versionsAdded} of ${skills.versions} skill versions from Hephaestus.`,
  );
} catch (error) {
  await target.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await Promise.all([source.end(), target.end()]);
}

/**
 * The skills and their versions. A skill whose name Agora already has (made
 * in Agora meanwhile) is left out, with its versions.
 */
async function importSkills(
  source: pg.Client,
  target: pg.Client,
): Promise<{
  skills: number;
  skillsAdded: number;
  versions: number;
  versionsAdded: number;
}> {
  const skills = await source.query(
    `SELECT id, organization_id, name, description, status, latest_version,
            created_by, created_at, updated_at
       FROM skills ORDER BY created_at, id`,
  );
  const versions = await source.query(
    `SELECT id, skill_id, organization_id, name, version, description, files,
            file_count, size_bytes, created_by, created_at
       FROM skill_versions ORDER BY skill_id, version`,
  );
  let skillsAdded = 0;
  for (const row of skills.rows) {
    const result = await target.query(
      `INSERT INTO skills (id, organization_id, name, description, status,
                           latest_version, revision, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9)
       ON CONFLICT DO NOTHING`,
      [
        row.id,
        row.organization_id,
        row.name,
        row.description,
        row.status,
        row.latest_version,
        row.created_by,
        row.created_at,
        row.updated_at,
      ],
    );
    skillsAdded += result.rowCount ?? 0;
  }
  const present = new Set(
    (await target.query<{ id: string }>(`SELECT id FROM skills`)).rows.map(
      (row) => row.id,
    ),
  );
  let versionsAdded = 0;
  for (const row of versions.rows) {
    if (!present.has(row.skill_id)) continue;
    const result = await target.query(
      `INSERT INTO skill_versions (id, skill_id, organization_id, name, version,
                                   description, files, file_count, size_bytes,
                                   created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING`,
      [
        row.id,
        row.skill_id,
        row.organization_id,
        row.name,
        row.version,
        row.description,
        JSON.stringify(row.files),
        row.file_count,
        row.size_bytes,
        row.created_by,
        row.created_at,
      ],
    );
    versionsAdded += result.rowCount ?? 0;
  }
  return {
    skills: skills.rowCount ?? 0,
    skillsAdded,
    versions: versions.rowCount ?? 0,
    versionsAdded,
  };
}
