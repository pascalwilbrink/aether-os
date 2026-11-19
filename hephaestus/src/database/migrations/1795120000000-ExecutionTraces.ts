import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExecutionTraces1795120000000 implements MigrationInterface {
  name = 'ExecutionTraces1795120000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "executions" ADD "trace_id" text
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "executions" DROP COLUMN "trace_id"
        `);
  }
}
