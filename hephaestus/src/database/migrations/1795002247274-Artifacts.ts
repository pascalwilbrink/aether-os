import { MigrationInterface, QueryRunner } from 'typeorm';

export class Artifacts1795002247274 implements MigrationInterface {
  name = 'Artifacts1795002247274';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "artifacts" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "task_id" uuid NOT NULL,
                "execution_id" uuid NOT NULL,
                "agent_version_id" uuid NOT NULL,
                "kind" text NOT NULL,
                "status" text NOT NULL,
                "primary" boolean NOT NULL,
                "revision_of" uuid,
                "title" text NOT NULL,
                "metadata" jsonb NOT NULL,
                "body" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL,
                CONSTRAINT "ck_artifacts_kind" CHECK (kind IN ('text', 'json')),
                CONSTRAINT "ck_artifacts_status" CHECK (
                    status IN (
                        'pending',
                        'draft',
                        'final',
                        'rejected',
                        'changes_requested',
                        'partial'
                    )
                ),
                CONSTRAINT "PK_6516bbed3c129918e05c5012edb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_artifacts_final_primary_task_id" ON "artifacts" ("task_id")
            WHERE "primary"
                AND status = 'final'
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_artifacts_execution_id" ON "artifacts" ("execution_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_artifacts_task_id_created_at_id" ON "artifacts" ("task_id", "created_at", "id")
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "primary_artifact_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "primary_artifact_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_artifacts_task_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_artifacts_execution_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_artifacts_final_primary_task_id"
        `);
    await queryRunner.query(`
            DROP TABLE "artifacts"
        `);
  }
}
