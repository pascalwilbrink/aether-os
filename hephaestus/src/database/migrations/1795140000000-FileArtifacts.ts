import type { MigrationInterface, QueryRunner } from 'typeorm';

/** `file` artifacts: a file kept in Loculus (docs/files.md). */
export class FileArtifacts1795140000000 implements MigrationInterface {
  name = 'FileArtifacts1795140000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP CONSTRAINT "ck_artifacts_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json', 'verification', 'pull_request', 'file'))
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP CONSTRAINT "ck_artifacts_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json', 'verification', 'pull_request'))
        `);
  }
}
