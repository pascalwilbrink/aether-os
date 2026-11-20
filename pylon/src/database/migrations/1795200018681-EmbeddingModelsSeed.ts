import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * OpenAI's embedding models (`kind: embedding`), for Pylon's embeddings
 * endpoint, at their list prices per million input tokens (they have no
 * output). Later changes go through the API, like every model's. Skips
 * models that are already there.
 */
const MODELS: { model: string; name: string; input: string }[] = [
  {
    model: 'text-embedding-3-small',
    name: 'OpenAI text-embedding-3-small',
    input: '0.02',
  },
  {
    model: 'text-embedding-3-large',
    name: 'OpenAI text-embedding-3-large',
    input: '0.13',
  },
];

export class EmbeddingModelsSeed1795200018681 implements MigrationInterface {
  name = 'EmbeddingModelsSeed1795200018681';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const entry of MODELS) {
      const [inserted] = (await queryRunner.query(
        `INSERT INTO "models" ("id", "provider", "model", "kind", "name", "status", "context_window", "max_output_tokens", "version", "created_by", "created_at", "updated_at")
         VALUES (gen_random_uuid(), 'openai', $1, 'embedding', $2, 'active', 8192, NULL, 1, 'aether-os', now(), now())
         ON CONFLICT ("provider", "model") DO NOTHING
         RETURNING "id"`,
        [entry.model, entry.name],
      )) as { id: string }[];
      if (!inserted) {
        continue;
      }
      await queryRunner.query(
        `INSERT INTO "model_prices" ("id", "model_id", "effective_from", "input_per_m_tok", "output_per_m_tok", "cache_read_per_m_tok", "cache_write_per_m_tok", "long_context", "created_by", "created_at")
         VALUES (gen_random_uuid(), $1, now(), $2, '0', NULL, NULL, NULL, 'aether-os', now())`,
        [inserted.id, Number(entry.input).toFixed(6)],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "model_prices" WHERE "model_id" IN (SELECT "id" FROM "models" WHERE "kind" = 'embedding' AND "created_by" = 'aether-os')`,
    );
    await queryRunner.query(
      `DELETE FROM "models" WHERE "kind" = 'embedding' AND "created_by" = 'aether-os'`,
    );
  }
}
