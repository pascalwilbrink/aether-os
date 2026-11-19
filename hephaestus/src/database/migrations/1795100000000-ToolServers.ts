import { MigrationInterface, QueryRunner } from 'typeorm';

export class ToolServers1795100000000 implements MigrationInterface {
  name = 'ToolServers1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "tool_servers" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "url" text NOT NULL,
                "auth_type" text NOT NULL,
                "header_name" text,
                "credential_hint" text,
                "credential_updated_by" text,
                "credential_updated_at" TIMESTAMP WITH TIME ZONE,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_tool_servers_auth_type" CHECK (auth_type IN ('none', 'header', 'task-token')),
                CONSTRAINT "PK_264f4ae76799f45f69a5c5db898" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_tool_servers_organization_id_name" ON "tool_servers" ("organization_id", "name")
        `);
    // Agent versions' tools name a tool server now and may choose its tools;
    // the free-form `configuration` they could carry before is gone.
    await queryRunner.query(`
            UPDATE "agent_versions"
            SET "tools" = (
                SELECT COALESCE(jsonb_agg(tool - 'configuration'), '[]'::jsonb)
                FROM jsonb_array_elements("tools") AS tool
            )
            WHERE "tools" @? '$[*].configuration'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_tool_servers_organization_id_name"
        `);
    await queryRunner.query(`
            DROP TABLE "tool_servers"
        `);
  }
}
