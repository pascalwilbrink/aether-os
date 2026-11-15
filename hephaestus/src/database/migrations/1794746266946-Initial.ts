import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1794746266946 implements MigrationInterface {
  name = 'Initial1794746266946';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`
            CREATE TABLE "organizations" (
                "id" uuid NOT NULL,
                "name" text NOT NULL,
                "slug" text NOT NULL,
                "status" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_organizations_slug" UNIQUE ("slug"),
                CONSTRAINT "ck_organizations_status" CHECK (status IN ('active', 'suspended')),
                CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_organizations_created_at_id" ON "organizations" ("created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "projects" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "slug" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_projects_organization_id_slug" UNIQUE ("organization_id", "slug"),
                CONSTRAINT "ck_projects_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_projects_organization_id_created_at_id" ON "projects" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "workspaces" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "execution_id" uuid NOT NULL,
                "status" text NOT NULL,
                "repository" jsonb NOT NULL,
                "sandbox" jsonb NOT NULL,
                "sandbox_reference" jsonb,
                "working_directory" text NOT NULL,
                "failure_reason" text,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "started_at" TIMESTAMP WITH TIME ZONE,
                "destroyed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "ck_workspaces_status" CHECK (
                    status IN (
                        'requested',
                        'provisioning',
                        'ready',
                        'in_use',
                        'suspended',
                        'stopping',
                        'destroyed',
                        'failed',
                        'expired'
                    )
                ),
                CONSTRAINT "PK_098656ae401f3e1a4586f47fd8e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_workspaces_execution_id" ON "workspaces" ("execution_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_workspaces_organization_id_created_at_id" ON "workspaces" ("organization_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_workspaces_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_workspaces_execution_id"
        `);
    await queryRunner.query(`
            DROP TABLE "workspaces"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_projects_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "projects"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_organizations_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "organizations"
        `);
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
  }
}
