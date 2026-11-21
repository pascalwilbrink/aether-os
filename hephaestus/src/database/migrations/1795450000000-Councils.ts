import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Hephaestus's copy of Agora's councils and published versions (docs/councils.md). */
export class Councils1795450000000 implements MigrationInterface {
  name = 'Councils1795450000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "council_versions" (
                "id" uuid NOT NULL,
                "council_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "status" text NOT NULL,
                "content" jsonb NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_council_versions_status" CHECK (status IN ('published', 'deprecated')),
                CONSTRAINT "PK_1974e6d4cf0785efade229f7178" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_council_versions_council_id" ON "council_versions" ("council_id")
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
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_councils_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_4966fa6c4948bab2ea3e31e054d" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "councils"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_council_versions_council_id"
        `);
    await queryRunner.query(`
            DROP TABLE "council_versions"
        `);
  }
}
