import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The catalogue's starting models: Anthropic's current ones, at the prices
 * on its pricing page (platform.claude.com/docs/en/about-claude/pricing,
 * November 2026; cache writes at the 5-minute rate). Later changes go
 * through the API (`POST /v1/models`, `…/prices`), never another migration,
 * so prices stay versioned. Skips models that are already there.
 */
const MODELS: {
  model: string;
  name: string;
  contextWindow: number | null;
  rates: [input: string, output: string, cacheRead: string, cacheWrite: string];
  longContext?: {
    aboveInputTokens: number;
    rates: [string, string, string, string];
  };
}[] = [
  {
    model: 'claude-fable-5-2',
    name: 'Claude Fable 5.2',
    contextWindow: 1_000_000,
    rates: ['8', '40', '0.2', '10'],
  },
  {
    model: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    contextWindow: 1_000_000,
    rates: ['4', '20', '0.2', '5'],
  },
  {
    model: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    contextWindow: 1_000_000,
    rates: ['2', '10', '0.1', '2.5'],
  },
  {
    model: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    contextWindow: null,
    rates: ['0.1', '0.5', '0.01', '0.125'],
    longContext: {
      aboveInputTokens: 100_000,
      rates: ['0.5', '2.5', '0.05', '0.625'],
    },
  },
];

const six = (value: string) => Number(value).toFixed(6);

export class ModelCatalogSeed1795200018679 implements MigrationInterface {
  name = 'ModelCatalogSeed1795200018679';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const entry of MODELS) {
      const [inserted] = (await queryRunner.query(
        `INSERT INTO "models" ("id", "provider", "model", "name", "status", "context_window", "max_output_tokens", "version", "created_by", "created_at", "updated_at")
         VALUES (gen_random_uuid(), 'anthropic', $1, $2, 'active', $3, NULL, 1, 'aether-os', now(), now())
         ON CONFLICT ("provider", "model") DO NOTHING
         RETURNING "id"`,
        [entry.model, entry.name, entry.contextWindow],
      )) as { id: string }[];
      if (!inserted) {
        continue;
      }
      const [input, output, cacheRead, cacheWrite] = entry.rates;
      const longContext = entry.longContext
        ? {
            aboveInputTokens: entry.longContext.aboveInputTokens,
            inputPerMTok: six(entry.longContext.rates[0]),
            outputPerMTok: six(entry.longContext.rates[1]),
            cacheReadPerMTok: six(entry.longContext.rates[2]),
            cacheWritePerMTok: six(entry.longContext.rates[3]),
          }
        : null;
      await queryRunner.query(
        `INSERT INTO "model_prices" ("id", "model_id", "effective_from", "input_per_m_tok", "output_per_m_tok", "cache_read_per_m_tok", "cache_write_per_m_tok", "long_context", "created_by", "created_at")
         VALUES (gen_random_uuid(), $1, now(), $2, $3, $4, $5, $6, 'aether-os', now())`,
        [
          inserted.id,
          input,
          output,
          cacheRead,
          cacheWrite,
          longContext ? JSON.stringify(longContext) : null,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "model_prices" WHERE "created_by" = 'aether-os'`,
    );
    await queryRunner.query(
      `DELETE FROM "models" WHERE "created_by" = 'aether-os'`,
    );
  }
}
