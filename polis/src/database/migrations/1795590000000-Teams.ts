import { MigrationInterface, QueryRunner } from 'typeorm';

/** An organization's teams, the departments they're in and their members (persons). */
export class Teams1795590000000 implements MigrationInterface {
  name = 'Teams1795590000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "teams" (
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
                CONSTRAINT "uq_teams_organization_id_slug" UNIQUE ("organization_id", "slug"),
                CONSTRAINT "ck_teams_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_7e5523774a38b08a6236d322403" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_teams_organization_id_created_at_id" ON "teams" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "team_departments" (
                "team_id" uuid NOT NULL,
                "department_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_69821aefe6a50903ade76a07da3" PRIMARY KEY ("team_id", "department_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_team_departments_department_id" ON "team_departments" ("department_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "team_members" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "team_id" uuid NOT NULL,
                "person_id" uuid NOT NULL,
                "added_by" text NOT NULL,
                "added_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_team_members_team_id_person_id" UNIQUE ("team_id", "person_id"),
                CONSTRAINT "PK_ca3eae89dcf20c9fd95bf7460aa" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_team_members_team_id_added_at_id" ON "team_members" ("team_id", "added_at", "id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_team_members_person_id" ON "team_members" ("person_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "team_members"
        `);
    await queryRunner.query(`
            DROP TABLE "team_departments"
        `);
    await queryRunner.query(`
            DROP TABLE "teams"
        `);
  }
}
