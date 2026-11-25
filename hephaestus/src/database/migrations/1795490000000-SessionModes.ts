import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A council session's mode (docs/councils.md, Collaboration modes):
 * sessions from before start out facilitated.
 */
export class SessionModes1795490000000 implements MigrationInterface {
  name = 'SessionModes1795490000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD "mode" text
        `);
    await queryRunner.query(`
            UPDATE "sessions" SET "mode" = 'facilitated' WHERE "council_id" IS NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD CONSTRAINT "ck_sessions_mode" CHECK (mode IS NULL OR mode IN ('direct', 'facilitated', 'discussion', 'planning', 'delegation'))
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP CONSTRAINT "ck_sessions_mode"
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP COLUMN "mode"
        `);
  }
}
