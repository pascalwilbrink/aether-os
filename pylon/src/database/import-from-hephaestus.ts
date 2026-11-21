import 'reflect-metadata';

import pg from 'pg';

/**
 * Brings the model gateway's data over from Hephaestus (docs/pylon.md,
 * Moving there), once, in one transaction, with the same IDs:
 *
 * - its copy of Agora's agents (Pylon's copy starts empty: Agora's events
 *   before Pylon subscribed are gone);
 * - the model catalogue and its prices: Hephaestus's replace the models
 *   Pylon's migrations seeded (the same models, maybe with prices added
 *   since), so recorded calls keep naming their price;
 * - the provider keys' records (the keys themselves stay in OpenBao, at the
 *   same paths), the budgets, and every recorded call.
 *
 * Rows Pylon already has are left alone, so running it again is harmless;
 * nothing is published. Run Pylon's migrations first, and import before
 * Hephaestus runs with Pylon only (docs/pylon.md, step 2): budgets set in
 * Hephaestus apply from then on.
 *
 *   HEPHAESTUS_DATABASE_URL=postgres://aether:aether@localhost:5432/hephaestus \
 *     pnpm import:hephaestus
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

/** Rows read and written per round for the (possibly many) calls. */
const BATCH = 1000;

const source = new pg.Client({ connectionString: from });
const target = new pg.Client({ connectionString: to });
await source.connect();
await target.connect();

/** Inserts rows as they are (same column names), skipping ones already there. */
async function copy(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  conflict = '(id)',
): Promise<number> {
  let added = 0;
  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];
      return value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date)
        ? JSON.stringify(value)
        : value;
    });
    const result = await target.query(
      `INSERT INTO ${table} (${columns.join(', ')})
       VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})
       ON CONFLICT ${conflict} DO NOTHING`,
      values,
    );
    added += result.rowCount ?? 0;
  }
  return added;
}

try {
  await target.query('BEGIN');
  const report: string[] = [];

  const agents = await source.query(
    `SELECT id, organization_id, status, version, created_at, updated_at FROM agents`,
  );
  report.push(
    `${await copy('agents', ['id', 'organization_id', 'status', 'version', 'created_at', 'updated_at'], agents.rows)} of ${agents.rowCount} agents`,
  );

  // Hephaestus's catalogue is the one in use: the models Pylon seeded give
  // way to it (Pylon has recorded no calls at them yet).
  const models = await source.query(
    `SELECT id, provider, model, name, status, context_window, max_output_tokens,
            version, created_by, created_at, updated_at FROM models`,
  );
  for (const model of models.rows) {
    await target.query(
      `DELETE FROM model_prices WHERE model_id IN (
         SELECT id FROM models WHERE provider = $1 AND model = $2 AND id <> $3)`,
      [model.provider, model.model, model.id],
    );
    await target.query(
      `DELETE FROM models WHERE provider = $1 AND model = $2 AND id <> $3`,
      [model.provider, model.model, model.id],
    );
  }
  report.push(
    `${await copy(
      'models',
      [
        'id',
        'provider',
        'model',
        'name',
        'status',
        'context_window',
        'max_output_tokens',
        'version',
        'created_by',
        'created_at',
        'updated_at',
      ],
      models.rows,
    )} of ${models.rowCount} models`,
  );
  const prices = await source.query(
    `SELECT id, model_id, effective_from, input_per_m_tok, output_per_m_tok,
            cache_read_per_m_tok, cache_write_per_m_tok, long_context,
            created_by, created_at FROM model_prices`,
  );
  report.push(
    `${await copy(
      'model_prices',
      [
        'id',
        'model_id',
        'effective_from',
        'input_per_m_tok',
        'output_per_m_tok',
        'cache_read_per_m_tok',
        'cache_write_per_m_tok',
        'long_context',
        'created_by',
        'created_at',
      ],
      prices.rows,
    )} of ${prices.rowCount} prices`,
  );

  const keys = await source.query(
    `SELECT id, organization_id, scope, scope_id, provider, hint, base_url,
            updated_by, created_at, updated_at FROM model_keys`,
  );
  report.push(
    `${await copy(
      'model_keys',
      [
        'id',
        'organization_id',
        'scope',
        'scope_id',
        'provider',
        'hint',
        'base_url',
        'updated_by',
        'created_at',
        'updated_at',
      ],
      keys.rows,
    )} of ${keys.rowCount} key records`,
  );

  const budgets = await source.query(
    `SELECT id, organization_id, project_id, scope, scope_id, limit_usd,
            threshold_window, version, updated_by, created_at, updated_at FROM budgets`,
  );
  report.push(
    `${await copy(
      'budgets',
      [
        'id',
        'organization_id',
        'project_id',
        'scope',
        'scope_id',
        'limit_usd',
        'threshold_window',
        'version',
        'updated_by',
        'created_at',
        'updated_at',
      ],
      budgets.rows,
    )} of ${budgets.rowCount} budgets`,
  );

  // Calls, in batches; Hephaestus made every one for an agent. Those it made
  // through Pylon (USE_PYLON, key_source 'pylon') Pylon recorded itself.
  let calls = 0;
  let total = 0;
  // Paged by ID: timestamps come back as Dates, which drop microseconds.
  let after: string | null = null;
  for (;;) {
    const batch: pg.QueryResult = await source.query(
      `SELECT id, organization_id, project_id, task_id,
              top_level_task_id AS task_tree_id, agent_id, agent_version_id,
              execution_id, 'hephaestus' AS caller, 'agent' AS purpose,
              'chat' AS kind, provider, model, key_source, input_tokens,
              output_tokens, cache_read_tokens, cache_write_tokens, cost_usd,
              price_id, finish_reason, created_at
         FROM model_calls
        WHERE key_source <> 'pylon' AND ($1::uuid IS NULL OR id > $1::uuid)
        ORDER BY id LIMIT ${BATCH}`,
      [after],
    );
    if (batch.rowCount === 0) break;
    total += batch.rowCount ?? 0;
    calls += await copy(
      'model_calls',
      [
        'id',
        'organization_id',
        'project_id',
        'task_id',
        'task_tree_id',
        'agent_id',
        'agent_version_id',
        'execution_id',
        'caller',
        'purpose',
        'kind',
        'provider',
        'model',
        'key_source',
        'input_tokens',
        'output_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'cost_usd',
        'price_id',
        'finish_reason',
        'created_at',
      ],
      batch.rows,
    );
    after = (batch.rows.at(-1) as { id: string }).id;
  }
  report.push(`${calls} of ${total} model calls`);

  await target.query('COMMIT');
  console.log(`Imported from Hephaestus: ${report.join(', ')}.`);
} catch (error) {
  await target.query('ROLLBACK').catch(() => undefined);
  throw error;
} finally {
  await Promise.all([source.end(), target.end()]);
}
