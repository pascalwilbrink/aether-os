import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Text from outside on tasks (../../../../docs/git.md, Untrusted input):
 * named `{{name}}` in the task's text fields, marked as data for the agent.
 */
export class UntrustedInputs1795440000000 implements MigrationInterface {
  name = 'UntrustedInputs1795440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" ADD "untrusted_inputs" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tasks" DROP COLUMN "untrusted_inputs"`,
    );
  }
}
