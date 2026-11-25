import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decisions with their rationale and alternatives, and items an agent
 * proposed in a session (`source_kind` `session`: a council's decisions,
 * docs/councils.md).
 */
export class Decisions1795530000000 implements MigrationInterface {
  name = 'Decisions1795530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['knowledge_items', 'knowledge_item_versions']) {
      await queryRunner.query(`
            ALTER TABLE "${table}"
            ADD "rationale" text,
            ADD "alternatives" jsonb NOT NULL DEFAULT '[]'
        `);
    }
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "source_session_id" uuid,
            ADD "source_agent_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_source_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_source_kind" CHECK (
                    source_kind IN ('person', 'task', 'session', 'repository')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_source_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_source_kind" CHECK (
                    source_kind IN ('person', 'task', 'repository')
                )
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            DROP COLUMN "source_agent_id",
            DROP COLUMN "source_session_id"
        `);
    for (const table of ['knowledge_item_versions', 'knowledge_items']) {
      await queryRunner.query(`
            ALTER TABLE "${table}" DROP COLUMN "alternatives", DROP COLUMN "rationale"
        `);
    }
  }
}
