import { MigrationInterface, QueryRunner } from 'typeorm';

export class Memberships1794743007032 implements MigrationInterface {
  name = 'Memberships1794743007032';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "memberships" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "subject_type" text NOT NULL,
                "subject" text NOT NULL,
                "roles" text array NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_memberships_organization_id_subject" UNIQUE ("organization_id", "subject_type", "subject"),
                CONSTRAINT "ck_memberships_roles" CHECK (
                    cardinality(roles) >= 1
                    AND roles <@ ARRAY ['owner', 'admin', 'member', 'viewer']::text []
                ),
                CONSTRAINT "ck_memberships_subject_type" CHECK (subject_type IN ('user', 'service_account')),
                CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_memberships_subject_created_at_id" ON "memberships" ("subject_type", "subject", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_memberships_organization_id_created_at_id" ON "memberships" ("organization_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_memberships_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_memberships_subject_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "memberships"
        `);
  }
}
