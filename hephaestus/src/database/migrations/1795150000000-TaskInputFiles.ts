import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Files a task starts from (Loculus, docs/files.md). */
export class TaskInputFiles1795150000000 implements MigrationInterface {
  name = 'TaskInputFiles1795150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "input_file_ids" uuid array NOT NULL DEFAULT '{}'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "input_file_ids"
        `);
  }
}
