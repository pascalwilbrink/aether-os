import { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskTemplates1795006479486 implements MigrationInterface {
  name = 'TaskTemplates1795006479486';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "task_template_versions" (
                "id" uuid NOT NULL,
                "template_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "content" jsonb NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_task_template_versions_template_id_version" UNIQUE ("template_id", "version"),
                CONSTRAINT "PK_702d77f478ae830d4ef606d9e37" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_task_template_versions_template_id_created_at_id" ON "task_template_versions" ("template_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "task_templates" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid,
                "scope" text NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "latest_version" integer NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_task_templates_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_a1347b5446b9e3158e2b72f58b2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_task_templates_organization_id_created_at_id" ON "task_templates" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "task_template_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "task_template_version" integer
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "task_template_version"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "task_template_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_task_templates_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "task_templates"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_task_template_versions_template_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "task_template_versions"
        `);
  }
}
