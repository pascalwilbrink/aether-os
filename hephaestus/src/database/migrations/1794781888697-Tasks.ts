import { MigrationInterface, QueryRunner } from 'typeorm';

export class Tasks1794781888697 implements MigrationInterface {
  name = 'Tasks1794781888697';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "tasks" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "parent_task_id" uuid,
                "top_level_task_id" uuid NOT NULL,
                "title" text NOT NULL,
                "instructions" text NOT NULL,
                "agent_id" uuid NOT NULL,
                "agent_version_id" uuid NOT NULL,
                "service_account_id" uuid NOT NULL,
                "requested_by" text NOT NULL,
                "status" text NOT NULL,
                "failure_reason" text,
                "depends_on" uuid array NOT NULL DEFAULT '{}',
                "attempt" integer NOT NULL DEFAULT '1',
                "idempotency_key" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "finished_at" TIMESTAMP WITH TIME ZONE,
                "version" integer NOT NULL DEFAULT '1',
                CONSTRAINT "uq_tasks_organization_id_idempotency_key" UNIQUE ("organization_id", "idempotency_key"),
                CONSTRAINT "ck_tasks_failure_reason" CHECK (
                    failure_reason IS NULL
                    OR failure_reason IN (
                        'agent_failed',
                        'verification_failed',
                        'rejected',
                        'timeout',
                        'budget_exceeded',
                        'infrastructure',
                        'subtask_failed'
                    )
                ),
                CONSTRAINT "ck_tasks_status" CHECK (
                    status IN (
                        'blocked',
                        'queued',
                        'provisioning',
                        'running',
                        'verifying',
                        'awaiting_review',
                        'waiting',
                        'paused',
                        'delivering',
                        'succeeded',
                        'failed',
                        'cancelled'
                    )
                ),
                CONSTRAINT "PK_8d12ff38fcc62aaba2cab748772" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_tasks_top_level_task_id" ON "tasks" ("top_level_task_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_tasks_parent_task_id" ON "tasks" ("parent_task_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_tasks_project_id_created_at_id" ON "tasks" ("project_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_tasks_project_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_tasks_parent_task_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_tasks_top_level_task_id"
        `);
    await queryRunner.query(`
            DROP TABLE "tasks"
        `);
  }
}
