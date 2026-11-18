import { MigrationInterface, QueryRunner } from 'typeorm';

export class Budgets1795041939868 implements MigrationInterface {
  name = 'Budgets1795041939868';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "budgets" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid,
                "scope" text NOT NULL,
                "scope_id" uuid NOT NULL,
                "limit_usd" numeric(18, 6),
                "threshold_window" text,
                "version" integer NOT NULL,
                "updated_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_budgets_scope" CHECK (
                    scope IN ('organization', 'project', 'task_tree')
                ),
                CONSTRAINT "PK_9c8a51748f82387644b773da482" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_budgets_scope_scope_id" ON "budgets" ("scope", "scope_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD "top_level_task_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "paused_for" text
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_top_level_task_id" ON "model_calls" ("top_level_task_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_project_id_created_at" ON "model_calls" ("project_id", "created_at")
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD CONSTRAINT "ck_tasks_paused_for" CHECK (
                    paused_for IS NULL
                    OR paused_for IN ('organization', 'project', 'task_tree')
                )
        `);

    // TypeORM doesn't see changed check constraints: an execution can end paused.
    await queryRunner.query(`
            ALTER TABLE "executions" DROP CONSTRAINT "ck_executions_status"
        `);
    await queryRunner.query(`
            ALTER TABLE "executions"
            ADD CONSTRAINT "ck_executions_status" CHECK (
                    status IN ('provisioning', 'running', 'completed', 'failed', 'cancelled', 'paused')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP CONSTRAINT "ck_tasks_paused_for"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_project_id_created_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_top_level_task_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "paused_for"
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP COLUMN "top_level_task_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_budgets_scope_scope_id"
        `);
    await queryRunner.query(`
            DROP TABLE "budgets"
        `);
  }
}
