import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModelCalls1794998423374 implements MigrationInterface {
  name = 'ModelCalls1794998423374';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "model_calls" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "task_id" uuid NOT NULL,
                "execution_id" uuid NOT NULL,
                "agent_version_id" uuid NOT NULL,
                "provider" text NOT NULL,
                "model" text NOT NULL,
                "key_source" text NOT NULL,
                "input_tokens" integer,
                "output_tokens" integer,
                "cost_usd" numeric(14, 6),
                "finish_reason" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_model_calls_key_source" CHECK (key_source IN ('organization', 'platform')),
                CONSTRAINT "PK_e2538384974b0960151a53380c1" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_organization_id_created_at" ON "model_calls" ("organization_id", "created_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_execution_id" ON "model_calls" ("execution_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_execution_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_organization_id_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "model_calls"
        `);
  }
}
