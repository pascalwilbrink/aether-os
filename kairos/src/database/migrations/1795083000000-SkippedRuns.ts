import { MigrationInterface, QueryRunner } from 'typeorm';

export class SkippedRuns1795083000000 implements MigrationInterface {
  name = 'SkippedRuns1795083000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM doesn't see changed check constraints: a run can be skipped
    // (its concurrency key's task was unfinished).
    await queryRunner.query(`
            ALTER TABLE "automation_runs" DROP CONSTRAINT "ck_automation_runs_status"
        `);
    await queryRunner.query(`
            ALTER TABLE "automation_runs"
            ADD CONSTRAINT "ck_automation_runs_status" CHECK (
                    status IN ('requested', 'created', 'skipped', 'rejected')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "automation_runs" DROP CONSTRAINT "ck_automation_runs_status"
        `);
    await queryRunner.query(`
            ALTER TABLE "automation_runs"
            ADD CONSTRAINT "ck_automation_runs_status" CHECK (
                    status IN ('requested', 'created', 'rejected')
                )
        `);
  }
}
