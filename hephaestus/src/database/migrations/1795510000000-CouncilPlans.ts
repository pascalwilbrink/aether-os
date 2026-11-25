import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A council session's plans (docs/councils.md, Planning and delegation). */
export class CouncilPlans1795510000000 implements MigrationInterface {
  name = 'CouncilPlans1795510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "council_plans" (
                "id" uuid NOT NULL,
                "session_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "status" text NOT NULL,
                "title" text NOT NULL,
                "summary" text NOT NULL,
                "milestones" jsonb NOT NULL DEFAULT '[]',
                "entries" jsonb NOT NULL DEFAULT '[]',
                "outcome_entry_key" text NOT NULL,
                "review" jsonb,
                "task_id" uuid,
                "proposed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_council_plans_status" CHECK (status IN ('proposed', 'approved', 'rejected', 'changes_requested', 'superseded')),
                CONSTRAINT "PK_9c1915253e84520727c7554529a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_council_plans_session_id_number" ON "council_plans" ("session_id", "number")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_council_plans_session_id_number"
        `);
    await queryRunner.query(`
            DROP TABLE "council_plans"
        `);
  }
}
