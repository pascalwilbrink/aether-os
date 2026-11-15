import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1794741066659 implements MigrationInterface {
  name = 'Initial1794741066659';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL, "name" text NOT NULL, "slug" text NOT NULL, "status" text NOT NULL, "created_by" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_organizations_slug" UNIQUE ("slug"), CONSTRAINT "ck_organizations_status" CHECK (status IN ('active', 'suspended')), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_organizations_created_at_id" ON "organizations"  ("created_at", "id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL, "organization_id" uuid NOT NULL, "name" text NOT NULL, "slug" text NOT NULL, "description" text NOT NULL, "status" text NOT NULL, "created_by" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL, "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "uq_projects_organization_id_slug" UNIQUE ("organization_id", "slug"), CONSTRAINT "ck_projects_status" CHECK (status IN ('active', 'archived')), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_projects_organization_id_created_at_id" ON "projects"  ("organization_id", "created_at", "id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_projects_organization_id_created_at_id"`,
    );
    await queryRunner.query(`DROP TABLE "projects"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_organizations_created_at_id"`,
    );
    await queryRunner.query(`DROP TABLE "organizations"`);
  }
}
