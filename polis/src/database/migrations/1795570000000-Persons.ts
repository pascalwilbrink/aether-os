import { MigrationInterface, QueryRunner } from 'typeorm';

/** The people of an organization, and the departments they're in. */
export class Persons1795570000000 implements MigrationInterface {
  name = 'Persons1795570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "persons" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "email" text NOT NULL,
                "description" text NOT NULL,
                "role" text,
                "gender" text,
                "user_id" uuid,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL DEFAULT '1',
                CONSTRAINT "uq_persons_organization_id_email" UNIQUE ("organization_id", "email"),
                CONSTRAINT "uq_persons_organization_id_user_id" UNIQUE ("organization_id", "user_id"),
                CONSTRAINT "PK_74278d8812a049233ce41440ac7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_persons_organization_id_created_at_id" ON "persons" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_persons_email" ON "persons" ("email")
        `);
    await queryRunner.query(`
            CREATE TABLE "person_departments" (
                "person_id" uuid NOT NULL,
                "department_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_7e7f29846c5da5f2ab4ea343335" PRIMARY KEY ("person_id", "department_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_person_departments_department_id" ON "person_departments" ("department_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "person_departments"
        `);
    await queryRunner.query(`
            DROP TABLE "persons"
        `);
  }
}
