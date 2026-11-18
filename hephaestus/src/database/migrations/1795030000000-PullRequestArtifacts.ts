import { MigrationInterface, QueryRunner } from 'typeorm';

/** `pull_request` artifacts (docs/git.md). TypeORM doesn't see check changes: by hand. */
export class PullRequestArtifacts1795030000000 implements MigrationInterface {
  name = 'PullRequestArtifacts1795030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP CONSTRAINT "ck_artifacts_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json', 'verification', 'pull_request'))
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP CONSTRAINT "ck_artifacts_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json', 'verification'))
        `);
  }
}
