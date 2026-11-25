import { MigrationInterface, QueryRunner } from 'typeorm';

/** Departments, and a project's optional department. */
export class Departments1795550000000 implements MigrationInterface {
  name = 'Departments1795550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "departments" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "slug" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL DEFAULT '1',
                CONSTRAINT "uq_departments_organization_id_slug" UNIQUE ("organization_id", "slug"),
                CONSTRAINT "ck_departments_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_departments_organization_id_created_at_id" ON "departments" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            ALTER TABLE "projects" ADD "department_id" uuid
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_projects_department_id_created_at_id" ON "projects" ("department_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_projects_department_id_created_at_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "projects" DROP COLUMN "department_id"
        `);
    await queryRunner.query(`
            DROP TABLE "departments"
        `);
  }
}
