import { MigrationInterface, QueryRunner } from 'typeorm';

/** Skills, moved from Hephaestus (../../../../docs/skills.md); `revision` is their events' `aggregateVersion`. */

export class Skills1795400000000 implements MigrationInterface {
  name = 'Skills1795400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "skills" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "latest_version" integer NOT NULL,
                "revision" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_skills_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_0d3212120f4ecedf90864d7e298" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_skills_organization_id_name" ON "skills" ("organization_id", "name")
        `);
    await queryRunner.query(`
            CREATE TABLE "skill_versions" (
                "id" uuid NOT NULL,
                "skill_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "version" integer NOT NULL,
                "description" text NOT NULL,
                "files" jsonb NOT NULL,
                "file_count" integer NOT NULL,
                "size_bytes" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_5c98dbb0de0ba8fbe6c7e0a768c" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_skill_versions_skill_id_version" ON "skill_versions" ("skill_id", "version")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "skill_versions"`);
    await queryRunner.query(`DROP TABLE "skills"`);
  }
}
