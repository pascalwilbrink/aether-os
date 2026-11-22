import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Each call's session, for a session token's (Hephaestus's sessions, docs/interaction.md). */
export class ModelCallSessions1795337227319 implements MigrationInterface {
  name = 'ModelCallSessions1795337227319';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD "session_id" uuid
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_model_calls_session_id" ON "model_calls" ("session_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_model_calls_session_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP COLUMN "session_id"
        `);
  }
}
