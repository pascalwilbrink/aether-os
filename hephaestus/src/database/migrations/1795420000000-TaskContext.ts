import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Knowledge pinned on tasks (../../../../docs/tasks.md, `context`): each
 * item and its version, and their text for the runner's prompt.
 */
export class TaskContext1795420000000 implements MigrationInterface {
  name = 'TaskContext1795420000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "context" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "context_content" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN "context_content"`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "context"`);
  }
}
