import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Councils (docs/councils.md, step 1): councils and their immutable
 * versions, like agents.
 */
export class Councils1795600000000 implements MigrationInterface {
  name = 'Councils1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "council_versions" (
                "id" uuid NOT NULL,
                "council_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "status" text NOT NULL,
                "facilitator_agent_id" uuid NOT NULL,
                "members" jsonb NOT NULL,
                "settings" jsonb NOT NULL,
                "discussion" jsonb NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_council_versions_council_id_version" UNIQUE ("council_id", "version"),
                CONSTRAINT "ck_council_versions_version" CHECK (version >= 1),
                CONSTRAINT "ck_council_versions_status" CHECK (status IN ('draft', 'published', 'deprecated')),
                CONSTRAINT "PK_1974e6d4cf0785efade229f7178" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_council_versions_council_id_version_id" ON "council_versions" ("council_id", "version", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "councils" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "key" text NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "latest_version_id" uuid,
                "version" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_councils_organization_id_key" UNIQUE ("organization_id", "key"),
                CONSTRAINT "ck_councils_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_4966fa6c4948bab2ea3e31e054d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_councils_organization_id_created_at_id" ON "councils" ("organization_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_councils_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "councils"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_council_versions_council_id_version_id"
        `);
    await queryRunner.query(`
            DROP TABLE "council_versions"
        `);
  }
}
