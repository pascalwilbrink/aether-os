import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795177735411 implements MigrationInterface {
  name = 'Initial1795177735411';

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
            CREATE TABLE "agent_versions" (
                "id" uuid NOT NULL,
                "agent_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "status" text NOT NULL,
                "instructions" text NOT NULL,
                "model" jsonb NOT NULL,
                "capabilities" jsonb NOT NULL,
                "tools" jsonb NOT NULL,
                "skills" jsonb NOT NULL,
                "runtime" jsonb NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_agent_versions_agent_id_version" UNIQUE ("agent_id", "version"),
                CONSTRAINT "ck_agent_versions_version" CHECK (version >= 1),
                CONSTRAINT "ck_agent_versions_status" CHECK (status IN ('draft', 'published', 'deprecated')),
                CONSTRAINT "PK_1707ad895314a76125e4ece3a27" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_agent_versions_agent_id_version_id" ON "agent_versions" ("agent_id", "version", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "agents" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "latest_version_id" uuid,
                "version" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_agents_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_9c653f28ae19c5884d5baf6a1d9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_agents_organization_id_created_at_id" ON "agents" ("organization_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_agents_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "agents"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_agent_versions_agent_id_version_id"
        `);
    await queryRunner.query(`
            DROP TABLE "agent_versions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
