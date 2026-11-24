import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Council sessions (docs/councils.md): a session's council, its version and
 * pinned members, and every message's author. Messages from before are the
 * person's or the session's agent's.
 */
export class CouncilSessions1795470000000 implements MigrationInterface {
  name = 'CouncilSessions1795470000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "session_messages"
            ADD "author_kind" text
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages"
            ADD "author_agent_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages"
            ADD "author_agent_version_id" uuid
        `);
    await queryRunner.query(`
            UPDATE "session_messages" message
            SET "author_kind" = CASE WHEN message.role = 'user' THEN 'user' ELSE 'agent' END,
                "author_agent_id" = CASE WHEN message.role = 'user' THEN NULL ELSE session.agent_id END,
                "author_agent_version_id" = CASE WHEN message.role = 'user' THEN NULL ELSE session.agent_version_id END
            FROM "sessions" session
            WHERE session.id = message.session_id
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages"
            ALTER COLUMN "author_kind" SET NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD "council_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD "council_version_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions"
            ADD "members" jsonb NOT NULL DEFAULT '[]'
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages"
            ADD CONSTRAINT "ck_session_messages_author_kind" CHECK (
                    author_kind IN ('user', 'agent', 'facilitator', 'member')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "session_messages" DROP CONSTRAINT "ck_session_messages_author_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP COLUMN "members"
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP COLUMN "council_version_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "sessions" DROP COLUMN "council_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages" DROP COLUMN "author_agent_version_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages" DROP COLUMN "author_agent_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "session_messages" DROP COLUMN "author_kind"
        `);
  }
}
