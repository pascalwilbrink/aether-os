import { MigrationInterface, QueryRunner } from 'typeorm';

/** The attempts at work: Hephaestus's tasks for work items, followed from their events. */
export class WorkExecutions1795697760877 implements MigrationInterface {
  name = 'WorkExecutions1795697760877';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "work_executions" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "work_item_id" uuid NOT NULL,
                "task_id" uuid NOT NULL,
                "agent_id" uuid NOT NULL,
                "agent_version_id" uuid NOT NULL,
                "status" text NOT NULL,
                "failure_reason" text,
                "primary_artifact_id" uuid,
                "task_version" integer NOT NULL,
                "version" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "finished_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_30b5f2f55ca4b6de57d26efa1d9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_work_executions_work_item_created_at_id" ON "work_executions" ("work_item_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "ux_work_executions_task_id" ON "work_executions" ("task_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "work_activity" DROP CONSTRAINT "ck_work_activity_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "work_activity"
            ADD CONSTRAINT "ck_work_activity_kind" CHECK (
                    kind IN (
                        'created',
                        'updated',
                        'status_changed',
                        'assignment_started',
                        'assignment_ended',
                        'dependency_added',
                        'dependency_removed',
                        'execution_started',
                        'execution_finished'
                    )
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "work_activity" DROP CONSTRAINT "ck_work_activity_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "work_activity"
            ADD CONSTRAINT "ck_work_activity_kind" CHECK (
                    kind IN (
                        'created',
                        'updated',
                        'status_changed',
                        'assignment_started',
                        'assignment_ended',
                        'dependency_added',
                        'dependency_removed'
                    )
                )
        `);
    await queryRunner.query(`
            DROP TABLE "work_executions"
        `);
  }
}
