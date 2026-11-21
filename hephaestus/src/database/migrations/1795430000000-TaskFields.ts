import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A task's brief (../../../../docs/tasks.md, Task fields): requirements,
 * expected outcome, constraints and deliverables beside its description
 * (still the `instructions` column), and the deliverable an artifact was
 * submitted for.
 */
export class TaskFields1795430000000 implements MigrationInterface {
  name = 'TaskFields1795430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "requirements" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(`ALTER TABLE "tasks" ADD "expected_outcome" text`);
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "constraints" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "deliverables" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(`ALTER TABLE "artifacts" ADD "deliverable_key" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "artifacts" DROP COLUMN "deliverable_key"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "deliverables"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "constraints"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "expected_outcome"`);
    await queryRunner.query(`ALTER TABLE "tasks" DROP COLUMN "requirements"`);
  }
}
