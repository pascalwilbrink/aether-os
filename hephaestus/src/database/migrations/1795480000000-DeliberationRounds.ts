import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deliberation rounds (docs/councils.md): a council session's rounds, and
 * the round a member's answer belongs to.
 */
export class DeliberationRounds1795480000000 implements MigrationInterface {
  name = 'DeliberationRounds1795480000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "deliberation_rounds" (
                "id" uuid NOT NULL,
                "session_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "question" text NOT NULL,
                "participants" jsonb NOT NULL DEFAULT '[]',
                "status" text NOT NULL,
                "conclusion" text,
                "opened_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "concluded_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "ck_deliberation_rounds_status" CHECK (status IN ('open', 'concluded')),
                CONSTRAINT "PK_c4816207d93a27c241dcfd7e70e" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_deliberation_rounds_session_id_number" ON "deliberation_rounds" ("session_id", "number")
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages"
            ADD "round_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "session_messages" DROP COLUMN "round_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_deliberation_rounds_session_id_number"
        `);
    await queryRunner.query(`
            DROP TABLE "deliberation_rounds"
        `);
  }
}
