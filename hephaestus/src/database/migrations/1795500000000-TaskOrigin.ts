import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Where a task came from, when not from a request: a council's plan (docs/councils.md). */
export class TaskOrigin1795500000000 implements MigrationInterface {
  name = 'TaskOrigin1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "origin" jsonb
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "origin"
        `);
  }
}
