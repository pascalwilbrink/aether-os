import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795679064150 implements MigrationInterface {
  name = 'Initial1795679064150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
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
            CREATE TABLE "agents" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_agents_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_agents_organization_id" ON "agents" ("organization_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "persons" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "user_id" uuid,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_persons_status" CHECK (status IN ('active', 'deleted')),
                CONSTRAINT "PK_74278d8812a049233ce41440ac7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_persons_organization_id" ON "persons" ("organization_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "work_activity" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "work_item_id" uuid NOT NULL,
                "kind" text NOT NULL,
                "actor" jsonb,
                "details" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_work_activity_kind" CHECK (
                    kind IN (
                        'created',
                        'updated',
                        'status_changed',
                        'assignment_started',
                        'assignment_ended',
                        'dependency_added',
                        'dependency_removed'
                    )
                ),
                CONSTRAINT "PK_d019c93ed3493664fd1ffe8dc79" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_work_activity_work_item_created_at_id" ON "work_activity" ("work_item_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "work_assignments" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "work_item_id" uuid NOT NULL,
                "assignee_kind" text NOT NULL,
                "assignee_id" uuid NOT NULL,
                "assignee_version_id" uuid,
                "role" text NOT NULL,
                "status" text NOT NULL,
                "reason" text,
                "assigned_by" jsonb NOT NULL,
                "started_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "ended_at" TIMESTAMP WITH TIME ZONE,
                "ended_by" jsonb,
                "end_reason" text,
                "version" integer NOT NULL,
                CONSTRAINT "ck_work_assignments_status" CHECK (status IN ('active', 'ended')),
                CONSTRAINT "ck_work_assignments_role" CHECK (
                    role IN (
                        'responsible',
                        'contributor',
                        'reviewer',
                        'observer'
                    )
                ),
                CONSTRAINT "ck_work_assignments_kind" CHECK (assignee_kind IN ('person', 'agent')),
                CONSTRAINT "PK_544be1ffd82eb7a344e1d550418" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_work_assignments_work_item_started_at_id" ON "work_assignments" ("work_item_id", "started_at", "id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "ux_work_assignments_active" ON "work_assignments" (
                "work_item_id",
                "assignee_kind",
                "assignee_id",
                "role"
            )
            WHERE status = 'active'
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "ux_work_assignments_responsible" ON "work_assignments" ("work_item_id")
            WHERE role = 'responsible'
                AND status = 'active'
        `);
    await queryRunner.query(`
            CREATE TABLE "work_dependencies" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "kind" text NOT NULL,
                "from_work_item_id" uuid NOT NULL,
                "to_work_item_id" uuid NOT NULL,
                "created_by" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_work_dependencies_distinct" CHECK (from_work_item_id <> to_work_item_id),
                CONSTRAINT "ck_work_dependencies_kind" CHECK (kind IN ('blocks', 'relates_to')),
                CONSTRAINT "PK_6c0ae2398d72657e33ae66b04af" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_work_dependencies_to" ON "work_dependencies" ("to_work_item_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "ux_work_dependencies_edge" ON "work_dependencies" ("from_work_item_id", "to_work_item_id", "kind")
        `);
    await queryRunner.query(
      `
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `,
      [
        database,
        'public',
        'work_items',
        'GENERATED_COLUMN',
        'scope_id',
        'COALESCE(project_id, organization_id)',
      ],
    );
    await queryRunner.query(`
            CREATE TABLE "work_items" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid,
                "scope_id" uuid GENERATED ALWAYS AS (COALESCE(project_id, organization_id)) STORED NOT NULL,
                "parent_id" uuid,
                "type" text NOT NULL,
                "title" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "priority" text NOT NULL,
                "needs_review" boolean NOT NULL,
                "requirements" jsonb NOT NULL,
                "expected_outcome" text,
                "constraints" jsonb NOT NULL,
                "acceptance_criteria" jsonb NOT NULL,
                "due_at" TIMESTAMP WITH TIME ZONE,
                "started_at" TIMESTAMP WITH TIME ZONE,
                "completed_at" TIMESTAMP WITH TIME ZONE,
                "source" jsonb NOT NULL,
                "created_by" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL,
                CONSTRAINT "ck_work_items_priority" CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
                CONSTRAINT "ck_work_items_type" CHECK (
                    type IN (
                        'task',
                        'bug',
                        'feature',
                        'incident',
                        'research',
                        'improvement',
                        'review',
                        'initiative'
                    )
                ),
                CONSTRAINT "ck_work_items_status" CHECK (
                    status IN (
                        'backlog',
                        'todo',
                        'in_progress',
                        'in_review',
                        'done',
                        'cancelled'
                    )
                ),
                CONSTRAINT "PK_afbfa01728533c866eafaf6f160" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_work_items_parent_id" ON "work_items" ("parent_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_work_items_scope_created_at_id" ON "work_items" (
                "organization_id",
                "scope_id",
                "created_at",
                "id"
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(`
            DROP INDEX "public"."ix_work_items_scope_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_work_items_parent_id"
        `);
    await queryRunner.query(`
            DROP TABLE "work_items"
        `);
    await queryRunner.query(
      `
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `,
      ['GENERATED_COLUMN', 'scope_id', database, 'public', 'work_items'],
    );
    await queryRunner.query(`
            DROP INDEX "public"."ux_work_dependencies_edge"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_work_dependencies_to"
        `);
    await queryRunner.query(`
            DROP TABLE "work_dependencies"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ux_work_assignments_responsible"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ux_work_assignments_active"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_work_assignments_work_item_started_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "work_assignments"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_work_activity_work_item_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "work_activity"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_persons_organization_id"
        `);
    await queryRunner.query(`
            DROP TABLE "persons"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_agents_organization_id"
        `);
    await queryRunner.query(`
            DROP TABLE "agents"
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
