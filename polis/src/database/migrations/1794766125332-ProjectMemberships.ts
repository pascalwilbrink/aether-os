import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProjectMemberships1794766125332 implements MigrationInterface {
  name = 'ProjectMemberships1794766125332';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "project_memberships" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "subject_type" text NOT NULL,
                "subject" text NOT NULL,
                "role" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL DEFAULT '1',
                CONSTRAINT "uq_project_memberships_project_id_subject" UNIQUE ("project_id", "subject_type", "subject"),
                CONSTRAINT "ck_project_memberships_role" CHECK (role IN ('approver', 'editor', 'viewer')),
                CONSTRAINT "ck_project_memberships_subject_type" CHECK (subject_type IN ('user', 'service_account')),
                CONSTRAINT "PK_856d7bae2d9bddc94861d41eded" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_project_memberships_subject_created_at_id" ON "project_memberships" (
                "organization_id",
                "subject_type",
                "subject",
                "created_at",
                "id"
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_project_memberships_project_id_created_at_id" ON "project_memberships" ("project_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_project_memberships_project_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_project_memberships_subject_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "project_memberships"
        `);
  }
}
