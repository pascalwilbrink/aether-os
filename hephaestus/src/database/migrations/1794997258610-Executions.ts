import { MigrationInterface, QueryRunner } from 'typeorm';

export class Executions1794997258610 implements MigrationInterface {
  name = 'Executions1794997258610';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "executions" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "task_id" uuid NOT NULL,
                "attempt" integer NOT NULL,
                "number" integer NOT NULL,
                "status" text NOT NULL,
                "failure_reason" text,
                "error" text,
                "summary" text,
                "runner_id" text NOT NULL,
                "sandbox_reference" jsonb,
                "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "heartbeat_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "deadline_at" TIMESTAMP WITH TIME ZONE,
                "ended_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_executions_task_id_number" UNIQUE ("task_id", "number"),
                CONSTRAINT "ck_executions_failure_reason" CHECK (
                    failure_reason IS NULL
                    OR failure_reason IN (
                        'agent_failed',
                        'timeout',
                        'infrastructure',
                        'access_denied',
                        'interrupted'
                    )
                ),
                CONSTRAINT "ck_executions_status" CHECK (
                    status IN (
                        'provisioning',
                        'running',
                        'completed',
                        'failed',
                        'cancelled'
                    )
                ),
                CONSTRAINT "PK_703e64e0ef651986191844b7b8b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_executions_task_id_started_at_id" ON "executions" ("task_id", "started_at", "id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_executions_active_heartbeat_at" ON "executions" ("heartbeat_at")
            WHERE status IN ('provisioning', 'running')
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_executions_active_task_id" ON "executions" ("task_id")
            WHERE status IN ('provisioning', 'running')
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "next_attempt_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_tasks_status_organization_id" ON "tasks" ("status", "organization_id")
        `);
    // Not detected by migration:generate: the new failure reason.
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP CONSTRAINT "ck_tasks_failure_reason"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD CONSTRAINT "ck_tasks_failure_reason" CHECK (
                failure_reason IS NULL
                OR failure_reason IN (
                    'agent_failed',
                    'verification_failed',
                    'rejected',
                    'timeout',
                    'budget_exceeded',
                    'infrastructure',
                    'subtask_failed',
                    'access_denied'
                )
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP CONSTRAINT "ck_tasks_failure_reason"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD CONSTRAINT "ck_tasks_failure_reason" CHECK (
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
            )
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_tasks_status_organization_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "next_attempt_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_executions_active_task_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_executions_active_heartbeat_at"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_executions_task_id_started_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "executions"
        `);
  }
}
