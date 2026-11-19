import { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskConcurrency1795082757713 implements MigrationInterface {
  name = 'TaskConcurrency1795082757713';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "concurrency_key" text
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "concurrency_policy" text
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_tasks_project_id_concurrency_key" ON "tasks" ("project_id", "concurrency_key")
            WHERE concurrency_key IS NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD CONSTRAINT "ck_tasks_concurrency_policy" CHECK (
                    concurrency_policy IS NULL
                    OR concurrency_policy IN ('queue', 'cancel-previous', 'skip')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP CONSTRAINT "ck_tasks_concurrency_policy"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_tasks_project_id_concurrency_key"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "concurrency_policy"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "concurrency_key"
        `);
  }
}
