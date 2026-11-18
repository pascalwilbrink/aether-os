import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModelCatalog1795038150208 implements MigrationInterface {
  name = 'ModelCatalog1795038150208';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "models" (
                "id" uuid NOT NULL,
                "provider" text NOT NULL,
                "model" text NOT NULL,
                "name" text NOT NULL,
                "status" text NOT NULL,
                "context_window" integer,
                "max_output_tokens" integer,
                "version" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_models_status" CHECK (status IN ('active', 'deprecated', 'retired')),
                CONSTRAINT "PK_ef9ed7160ea69013636466bf2d5" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_models_name_id" ON "models" ("name", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_models_provider_model" ON "models" ("provider", "model")
        `);
    await queryRunner.query(`
            CREATE TABLE "model_prices" (
                "id" uuid NOT NULL,
                "model_id" uuid NOT NULL,
                "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL,
                "input_per_m_tok" numeric(12, 6) NOT NULL,
                "output_per_m_tok" numeric(12, 6) NOT NULL,
                "cache_read_per_m_tok" numeric(12, 6),
                "cache_write_per_m_tok" numeric(12, 6),
                "long_context" jsonb,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_1409a57d11faf4496339c681f6e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_model_prices_model_id_effective_from" ON "model_prices" ("model_id", "effective_from")
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD "cache_read_tokens" integer
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD "cache_write_tokens" integer
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD "price_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP COLUMN "price_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP COLUMN "cache_write_tokens"
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP COLUMN "cache_read_tokens"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_model_prices_model_id_effective_from"
        `);
    await queryRunner.query(`
            DROP TABLE "model_prices"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_models_provider_model"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_models_name_id"
        `);
    await queryRunner.query(`
            DROP TABLE "models"
        `);
  }
}
