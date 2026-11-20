import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OpenAI's current models in the catalogue, the newest of each tier, at
 * their standard prices (developers.openai.com/api/docs/pricing, November
 * 2026, as LiteLLM's price list records them; cache writes at the default
 * retention; above 272K input tokens the long-context rates). Later changes
 * go through the API (`POST /v1/models`, `…/prices`), like Anthropic's.
 * Skips models that are already there.
 */
const MODELS: {
  model: string;
  name: string;
  rates: [input: string, output: string, cacheRead: string, cacheWrite: string];
  longContext: [
    input: string,
    output: string,
    cacheRead: string,
    cacheWrite: string,
  ];
}[] = [
  {
    model: 'gpt-6.2-astra',
    name: 'GPT-6.2 Astra',
    rates: ['8', '40', '0.4', '10'],
    longContext: ['16', '60', '0.8', '20'],
  },
  {
    model: 'gpt-6.2-sol',
    name: 'GPT-6.2 Sol',
    rates: ['2', '10', '0.1', '2.5'],
    longContext: ['4', '15', '0.2', '5'],
  },
  {
    model: 'gpt-6.1-terra',
    name: 'GPT-6.1 Terra',
    rates: ['1', '5', '0.05', '1.25'],
    longContext: ['2', '7.5', '0.1', '2.5'],
  },
  {
    model: 'gpt-6-luna',
    name: 'GPT-6 Luna',
    rates: ['0.1', '0.5', '0.01', '0.125'],
    longContext: ['0.2', '0.75', '0.02', '0.25'],
  },
];

const CONTEXT_WINDOW = 922_000;
const MAX_OUTPUT_TOKENS = 128_000;
const LONG_CONTEXT_ABOVE = 272_000;

const six = (value: string) => Number(value).toFixed(6);

export class OpenAiModelsSeed1795200018680 implements MigrationInterface {
  name = 'OpenAiModelsSeed1795200018680';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const entry of MODELS) {
      const [inserted] = (await queryRunner.query(
        `INSERT INTO "models" ("id", "provider", "model", "name", "status", "context_window", "max_output_tokens", "version", "created_by", "created_at", "updated_at")
         VALUES (gen_random_uuid(), 'openai', $1, $2, 'active', $3, $4, 1, 'aether-os', now(), now())
         ON CONFLICT ("provider", "model") DO NOTHING
         RETURNING "id"`,
        [entry.model, entry.name, CONTEXT_WINDOW, MAX_OUTPUT_TOKENS],
      )) as { id: string }[];
      if (!inserted) {
        continue;
      }
      const [input, output, cacheRead, cacheWrite] = entry.rates;
      const longContext = {
        aboveInputTokens: LONG_CONTEXT_ABOVE,
        inputPerMTok: six(entry.longContext[0]),
        outputPerMTok: six(entry.longContext[1]),
        cacheReadPerMTok: six(entry.longContext[2]),
        cacheWritePerMTok: six(entry.longContext[3]),
      };
      await queryRunner.query(
        `INSERT INTO "model_prices" ("id", "model_id", "effective_from", "input_per_m_tok", "output_per_m_tok", "cache_read_per_m_tok", "cache_write_per_m_tok", "long_context", "created_by", "created_at")
         VALUES (gen_random_uuid(), $1, now(), $2, $3, $4, $5, $6, 'aether-os', now())`,
        [
          inserted.id,
          input,
          output,
          cacheRead,
          cacheWrite,
          JSON.stringify(longContext),
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "model_prices" WHERE "model_id" IN (SELECT "id" FROM "models" WHERE "provider" = 'openai' AND "created_by" = 'aether-os')`,
    );
    await queryRunner.query(
      `DELETE FROM "models" WHERE "provider" = 'openai' AND "created_by" = 'aether-os'`,
    );
  }
}
