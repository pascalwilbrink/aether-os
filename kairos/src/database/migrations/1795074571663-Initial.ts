import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795074571663 implements MigrationInterface {
  name = 'Initial1795074571663';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "outbox" (
                "id" uuid NOT NULL,
                "exchange" text NOT NULL,
                "routing_key" text NOT NULL,
                "message" jsonb NOT NULL,
                "headers" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "attempts" integer NOT NULL,
                "last_error" text,
                CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_outbox_unpublished_created_at" ON "outbox" ("created_at", "id")
            WHERE published_at IS NULL
        `);
    await queryRunner.query(`
            CREATE TABLE "inbox" (
                "event_id" uuid NOT NULL,
                "source" text NOT NULL,
                "event_type" text NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_9b85eb4cab41c7c6023b1e579d0" PRIMARY KEY ("event_id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "automation_runs" (
                "id" uuid NOT NULL,
                "automation_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "status" text NOT NULL,
                "source_event_id" uuid NOT NULL,
                "event" jsonb NOT NULL,
                "task_id" uuid,
                "rejection" jsonb,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_automation_runs_status" CHECK (status IN ('requested', 'created', 'rejected')),
                CONSTRAINT "PK_273137fa78ff9340128ab98445f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_automation_runs_automation_id_created_at_id" ON "automation_runs" ("automation_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_automation_runs_automation_id_source_event_id" ON "automation_runs" ("automation_id", "source_event_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "automations" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "trigger" jsonb NOT NULL,
                "action" jsonb NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL,
                CONSTRAINT "ck_automations_status" CHECK (status IN ('active', 'paused', 'archived')),
                CONSTRAINT "PK_34c2cc382fc780ea36f7c478192" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_automations_organization_id_status" ON "automations" ("organization_id", "status")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_automations_project_id_created_at_id" ON "automations" ("project_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_automations_project_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_automations_organization_id_status"
        `);
    await queryRunner.query(`
            DROP TABLE "automations"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_automation_runs_automation_id_source_event_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_automation_runs_automation_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "automation_runs"
        `);
    await queryRunner.query(`
            DROP TABLE "inbox"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
