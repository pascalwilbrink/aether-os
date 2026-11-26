import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The Ergon work item a task is done for (Kairos's `ergon.work-assigned`). */
export class TaskWorkContext1795600000000 implements MigrationInterface {
  name = 'TaskWorkContext1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "work_context" jsonb
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "work_context"
        `);
  }
}
