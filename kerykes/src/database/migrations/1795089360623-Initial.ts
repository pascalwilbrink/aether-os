import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795089360623 implements MigrationInterface {
  name = 'Initial1795089360623';

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
            CREATE TABLE "organization_members" (
                "membership_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "sub" text NOT NULL,
                "roles" jsonb NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_organization_members_status" CHECK (status IN ('active', 'revoked')),
                CONSTRAINT "PK_69e0f179bf79218be32a62e489a" PRIMARY KEY ("membership_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_organization_members_organization_id_sub" ON "organization_members" ("organization_id", "sub")
        `);
    await queryRunner.query(`
            CREATE TABLE "project_members" (
                "membership_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "sub" text NOT NULL,
                "role" text NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_project_members_role" CHECK (role IN ('approver', 'editor', 'viewer')),
                CONSTRAINT "ck_project_members_status" CHECK (status IN ('active', 'revoked')),
                CONSTRAINT "PK_ab822936d927bcaa69b527d5589" PRIMARY KEY ("membership_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_project_members_organization_id_sub" ON "project_members" ("organization_id", "sub")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_project_members_organization_id_project_id" ON "project_members" ("organization_id", "project_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "organization_syncs" (
                "organization_id" uuid NOT NULL,
                "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_273da03f441ca05e006058b2836" PRIMARY KEY ("organization_id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid,
                "scope_id" uuid NOT NULL,
                "recipient" text NOT NULL,
                "type" text NOT NULL,
                "title" text NOT NULL,
                "body" text NOT NULL,
                "link" text NOT NULL,
                "task_id" uuid,
                "group_key" text NOT NULL,
                "event_id" uuid NOT NULL,
                "read" boolean NOT NULL,
                "read_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_notifications_type" CHECK (
                    type IN (
                        'review_requested',
                        'task_failed',
                        'task_succeeded',
                        'task_paused',
                        'budget_threshold',
                        'membership_granted'
                    )
                ),
                CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_notifications_organization_id_recipient_created_at_id" ON "notifications" (
                "organization_id",
                "recipient",
                "created_at",
                "id"
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_notifications_organization_id_recipient_group_key" ON "notifications" ("organization_id", "recipient", "group_key")
        `);
    await queryRunner.query(`
            CREATE TABLE "email_deliveries" (
                "notification_id" uuid NOT NULL,
                "status" text NOT NULL,
                "attempts" integer NOT NULL,
                "next_attempt_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "reason" text,
                "sent_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_email_deliveries_status" CHECK (
                    status IN ('pending', 'sent', 'failed', 'skipped')
                ),
                CONSTRAINT "PK_11faa697954fd601335f179dee1" PRIMARY KEY ("notification_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_email_deliveries_due" ON "email_deliveries" ("next_attempt_at")
            WHERE status = 'pending'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_email_deliveries_due"
        `);
    await queryRunner.query(`
            DROP TABLE "email_deliveries"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_notifications_organization_id_recipient_group_key"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_notifications_organization_id_recipient_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "notifications"
        `);
    await queryRunner.query(`
            DROP TABLE "organization_syncs"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_project_members_organization_id_project_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_project_members_organization_id_sub"
        `);
    await queryRunner.query(`
            DROP TABLE "project_members"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_organization_members_organization_id_sub"
        `);
    await queryRunner.query(`
            DROP TABLE "organization_members"
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
