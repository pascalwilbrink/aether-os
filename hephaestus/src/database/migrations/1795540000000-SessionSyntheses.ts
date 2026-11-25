import type { MigrationInterface, QueryRunner } from 'typeorm';

/** A council session's syntheses (docs/councils.md, Synthesis). */
export class SessionSyntheses1795540000000 implements MigrationInterface {
  name = 'SessionSyntheses1795540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "session_syntheses" (
                "id" uuid NOT NULL,
                "session_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "content" text NOT NULL,
                "round_ids" jsonb NOT NULL DEFAULT '[]',
                "written_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_6039c905a8c3b9f9a5e5197745b" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_session_syntheses_session_id_number" ON "session_syntheses" ("session_id", "number")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_session_syntheses_session_id_number"
        `);
    await queryRunner.query(`
            DROP TABLE "session_syntheses"
        `);
  }
}
