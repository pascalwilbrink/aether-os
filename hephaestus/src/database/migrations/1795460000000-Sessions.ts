import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Sessions and their messages (docs/interaction.md). */
export class Sessions1795460000000 implements MigrationInterface {
  name = 'Sessions1795460000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "session_messages" (
                "id" uuid NOT NULL,
                "session_id" uuid NOT NULL,
                "ordinal" integer NOT NULL,
                "message_id" text NOT NULL,
                "role" text NOT NULL,
                "content" text NOT NULL,
                "tool_calls" jsonb NOT NULL DEFAULT '[]',
                "tool_call_id" text,
                "tool_name" text,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_session_messages_role" CHECK (role IN ('user', 'assistant', 'tool')),
                CONSTRAINT "PK_25b3c73b5dd210b40ce5c02ce20" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_session_messages_session_id_message_id" ON "session_messages" ("session_id", "message_id")
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_session_messages_session_id_ordinal" ON "session_messages" ("session_id", "ordinal")
        `);
    await queryRunner.query(`
            CREATE TABLE "sessions" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "agent_id" uuid NOT NULL,
                "agent_version_id" uuid NOT NULL,
                "started_by" text NOT NULL,
                "title" text,
                "status" text NOT NULL,
                "ended_reason" text,
                "running_since" TIMESTAMP WITH TIME ZONE,
                "last_activity_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "ended_at" TIMESTAMP WITH TIME ZONE,
                "version" integer NOT NULL,
                CONSTRAINT "ck_sessions_ended_reason" CHECK (
                    ended_reason IS NULL
                    OR ended_reason IN ('closed', 'idle')
                ),
                CONSTRAINT "ck_sessions_status" CHECK (status IN ('active', 'ended')),
                CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_sessions_status_last_activity_at" ON "sessions" ("status", "last_activity_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_sessions_project_id_started_by_created_at_id" ON "sessions" ("project_id", "started_by", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_sessions_project_id_started_by_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_sessions_status_last_activity_at"
        `);
    await queryRunner.query(`
            DROP TABLE "sessions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_session_messages_session_id_ordinal"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_session_messages_session_id_message_id"
        `);
    await queryRunner.query(`
            DROP TABLE "session_messages"
        `);
  }
}
