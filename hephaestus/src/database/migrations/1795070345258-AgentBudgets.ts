import { MigrationInterface, QueryRunner } from 'typeorm';

export class AgentBudgets1795070345258 implements MigrationInterface {
  name = 'AgentBudgets1795070345258';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD "agent_id" uuid
        `);
    // Calls made before: their task's agent, so this month's spend counts them.
    await queryRunner.query(`
            UPDATE "model_calls" AS call
            SET "agent_id" = task."agent_id"
            FROM "tasks" AS task
            WHERE task."id" = call."task_id"
              AND call."agent_id" IS NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_agent_id_created_at" ON "model_calls" ("agent_id", "created_at")
        `);

    // TypeORM doesn't see changed check constraints: agents have budgets.
    await queryRunner.query(`
            ALTER TABLE "budgets" DROP CONSTRAINT "ck_budgets_scope"
        `);
    await queryRunner.query(`
            ALTER TABLE "budgets"
            ADD CONSTRAINT "ck_budgets_scope" CHECK (
                    scope IN ('organization', 'project', 'agent', 'task_tree')
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP CONSTRAINT "ck_tasks_paused_for"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD CONSTRAINT "ck_tasks_paused_for" CHECK (
                    paused_for IS NULL
                    OR paused_for IN ('organization', 'project', 'agent', 'task_tree')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_agent_id_created_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP COLUMN "agent_id"
        `);
  }
}
