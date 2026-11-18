import { MigrationInterface, QueryRunner } from 'typeorm';

export class Reviews1795003890137 implements MigrationInterface {
  name = 'Reviews1795003890137';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_artifacts_final_primary_task_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts"
            ADD "review" jsonb
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "review_artifact_kinds" text array NOT NULL DEFAULT '{}'
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "review_round" integer NOT NULL DEFAULT '0'
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_artifacts_task_id_status" ON "artifacts" ("task_id", "status")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_artifacts_primary_execution_id" ON "artifacts" ("execution_id")
            WHERE "primary"
                AND status IN ('final', 'draft')
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_artifacts_primary_execution_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_artifacts_task_id_status"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "review_round"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "review_artifact_kinds"
        `);
    await queryRunner.query(`
            ALTER TABLE "artifacts" DROP COLUMN "review"
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_artifacts_final_primary_task_id" ON "artifacts" USING btree ("task_id")
            WHERE (
                    "primary"
                    AND (status = 'final'::text)
                )
        `);
  }
}
