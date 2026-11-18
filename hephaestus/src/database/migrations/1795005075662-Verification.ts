import { MigrationInterface, QueryRunner } from 'typeorm';

export class Verification1795005075662 implements MigrationInterface {
  name = 'Verification1795005075662';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "acceptance_criteria" jsonb NOT NULL DEFAULT '[]'
        `);
    // Not detected by migration:generate: the new kind and failure reason.
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP CONSTRAINT "ck_artifacts_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json', 'verification'))
        `);
    await queryRunner.query(`
            ALTER TABLE "executions" DROP CONSTRAINT "ck_executions_failure_reason"
        `);
    await queryRunner.query(`
            ALTER TABLE "executions"
            ADD CONSTRAINT "ck_executions_failure_reason" CHECK (
                failure_reason IS NULL
                OR failure_reason IN (
                    'agent_failed',
                    'timeout',
                    'infrastructure',
                    'access_denied',
                    'interrupted',
                    'verification_failed'
                )
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "executions" DROP CONSTRAINT "ck_executions_failure_reason"
        `);
    await queryRunner.query(`
            ALTER TABLE "executions"
            ADD CONSTRAINT "ck_executions_failure_reason" CHECK (
                failure_reason IS NULL
                OR failure_reason IN ('agent_failed', 'timeout', 'infrastructure', 'access_denied', 'interrupted')
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP CONSTRAINT "ck_artifacts_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json'))
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "acceptance_criteria"
        `);
  }
}
