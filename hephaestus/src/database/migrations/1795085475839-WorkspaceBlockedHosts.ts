import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkspaceBlockedHosts1795085475839 implements MigrationInterface {
  name = 'WorkspaceBlockedHosts1795085475839';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "workspaces"
            ADD "blocked_hosts" jsonb NOT NULL DEFAULT '[]'::jsonb
        `);
    // Only to fill existing rows: new ones always set it.
    await queryRunner.query(`
            ALTER TABLE "workspaces" ALTER COLUMN "blocked_hosts" DROP DEFAULT
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "workspaces" DROP COLUMN "blocked_hosts"
        `);
  }
}
