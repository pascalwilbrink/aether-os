import { MigrationInterface, QueryRunner } from 'typeorm';

export class PullRequests1795028853653 implements MigrationInterface {
  name = 'PullRequests1795028853653';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "pull_requests" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "repository_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "url" text NOT NULL,
                "state" text NOT NULL,
                "branch" text NOT NULL,
                "base_branch" text NOT NULL,
                "head_sha" text NOT NULL,
                "merged_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL DEFAULT '1',
                CONSTRAINT "uq_pull_requests_repository_id_number" UNIQUE ("repository_id", "number"),
                CONSTRAINT "ck_pull_requests_state" CHECK (state IN ('open', 'closed', 'merged')),
                CONSTRAINT "PK_e8a8aa8710c3a9650a19a9c2e7b" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "pull_requests"
        `);
  }
}
